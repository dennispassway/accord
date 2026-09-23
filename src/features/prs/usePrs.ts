import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { MergeMethod } from "../../lib/github/merge";
import { mergePullRequest } from "../../lib/github/merge";
import { isTransientKind, NetworkError } from "../../lib/github/networkError";
import { AuthError, fetchAllPrs } from "../../lib/github/queries";
import type { ReviewEvent } from "../../lib/github/review";
import { submitReview as submitReviewMutation } from "../../lib/github/review";
import { tauriFetch } from "../../lib/github/tauriFetch";
import { MOCK_ME, MOCK_PRS } from "../../lib/mock/fixtures";
import { isMockApp, mockMode } from "../../lib/mock/mode";
import { loadPrsSnapshot, savePrsSnapshot } from "../../lib/prsSnapshot";
import { withRetry } from "../../lib/retry";

const IS_MOCK = isMockApp(mockMode());

export type PrsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      prs: PullRequest[];
      lastUpdated: Date;
      /** Fout van een achtergrond-refresh; de lijst blijft staan, dit wordt
       * als wegklikbare banner getoond (zie Cockpit.tsx). */
      refreshError: string | null;
      /** De ingelogde gebruiker, meegekomen in dezelfde PR-fetch (U2a) of
       * uit de laatste snapshot (U2b); `null` zolang geen van beide er is. */
      viewerLogin: string | null;
      /** True zodra een van de drie "@me"-searches meer dan 100 treffers
       * had: de lijst is dan afgekapt, zie Cockpit's banner. */
      truncated: boolean;
      /** True zolang deze `prs` nog de bewaarde snapshot van de vorige
       * sessie zijn (U2b) en geen echte fetch ze bevestigd heeft: een
       * PR die intussen gemerged of gesloten is staat er dan nog in, en een
       * snooze-prune mag daar niet op afgaan (zie pruneSnoozes-aanroep in
       * Cockpit.tsx). */
      fromSnapshot: boolean;
    };

async function getToken(): Promise<string | null> {
  return invoke<string | null>("get_token");
}

/** Een refresh-fout mag de al geladen lijst niet wegvegen: blijft de state
 * `ready`, dan wordt de fout ernaast getoond in plaats van de state te
 * vervangen. Alleen de allereerste load (nog geen data) toont het volledige
 * foutscherm. */
/** Werkt een PR bij na een lokale review-uitkomst (mock): reviewState volgt
 * wat GitHub's reviewDecision zou opleveren, en de eigen reviewer-entry
 * krijgt dezelfde state. Puur, voor testbaarheid los van de hook. */
export function applyReviewOutcome(
  pr: PullRequest,
  nextState: "approved" | "changesRequested",
  meLogin: string,
): PullRequest {
  return {
    ...pr,
    reviewState: { state: nextState },
    reviewRequestedFromMe: false,
    reviewers: pr.reviewers.map((reviewer) =>
      reviewer.login === meLogin ? { ...reviewer, state: nextState } : reviewer,
    ),
  };
}

export function nextStateOnLoadError(
  prev: PrsState,
  message: string,
): PrsState {
  if (prev.status === "ready") return { ...prev, refreshError: message };
  return { status: "error", message };
}

/**
 * Retry-beleid voor de refresh. Drie pogingen van maximaal 15 seconden plus
 * 2,5 seconden wachten blijft onder het kortste instelbare interval van één
 * minuut, en `inFlightRef` houdt een intervaltik tegen zolang er nog een
 * poging loopt.
 */
const REFRESH_ATTEMPTS = 3;
const REFRESH_DELAYS_MS = [500, 2000];

/** Alleen transportfouten die van een tweede poging beter worden. Een
 * afgewezen token, een rate limit of welk ander GitHub-antwoord dan ook
 * herhalen kost alleen tijd en houdt de lijst langer oud. */
export function shouldRetryRefresh(error: unknown): boolean {
  return error instanceof NetworkError && isTransientKind(error.kind);
}

/** Guard voor de U1 visibilitychange-refresh: niet vaker dan om de
 * `minIntervalMs` (default 30s), ongeacht hoe vaak het venster zichtbaar
 * wordt. */
export function shouldRefreshOnVisible(
  lastRefreshAt: number,
  now: number,
  options: { online?: boolean; minIntervalMs?: number } = {},
): boolean {
  const { online = true, minIntervalMs = 30_000 } = options;
  // Het venster wordt onder meer zichtbaar na wake uit sleep en na unlock.
  // Daar staat het netwerk vaak nog niet, en een poging levert dan alleen
  // een foutbanner op; het interval en cmd+R blijven over.
  if (!online) return false;
  return now - lastRefreshAt >= minIntervalMs;
}

/**
 * Houdt bij welke PR's net gemerged zijn: de GitHub search-index is
 * eventually consistent en geeft een gemergede PR nog even als open terug
 * (B2). Een fetch-uitkomst wordt hierdoor gefilterd i.p.v. te wachten op een
 * volledige refetch voordat de merge-knop/toast klaar mag zijn.
 */
export interface RecentlyMergedTracker {
  mark(prId: string, now?: number): void;
  filter(prs: PullRequest[], now?: number): PullRequest[];
}

export function createRecentlyMergedTracker(
  ttlMs = 10 * 60 * 1000,
): RecentlyMergedTracker {
  const expiresAtById = new Map<string, number>();
  return {
    mark(prId, now = Date.now()) {
      expiresAtById.set(prId, now + ttlMs);
    },
    filter(prs, now = Date.now()) {
      for (const [id, expiresAt] of expiresAtById) {
        if (expiresAt <= now) expiresAtById.delete(id);
      }
      if (expiresAtById.size === 0) return prs;
      return prs.filter((pr) => !expiresAtById.has(pr.id));
    },
  };
}

const recentlyMerged = createRecentlyMergedTracker();

/**
 * Vergelijkt de vorige en nieuwe fetch en geeft de eigen PR's terug waarvan
 * de CI net naar rood is omgeslagen (was pending/success/none, is nu
 * failure). Alleen `authoredByMe` telt mee: CI op andermans PR is niet iets
 * om over te melden.
 */
export function detectCiFlippedToRed(
  previous: PullRequest[],
  next: PullRequest[],
): PullRequest[] {
  const previousById = new Map(previous.map((pr) => [pr.id, pr]));
  return next.filter((pr) => {
    if (!pr.authoredByMe || pr.ciStatus.state !== "failure") return false;
    const prev = previousById.get(pr.id);
    return prev != null && prev.ciStatus.state !== "failure";
  });
}

function initialState(): PrsState {
  if (IS_MOCK) {
    return {
      status: "ready",
      prs: MOCK_PRS,
      lastUpdated: new Date(),
      refreshError: null,
      viewerLogin: MOCK_ME,
      // Visuele QA van de afkap-banner: ?mock=app&truncated
      truncated: new URLSearchParams(window.location.search).has("truncated"),
      fromSnapshot: false,
    };
  }
  // U2b: bij een koude start toont de laatste snapshot meteen iets, terwijl
  // de echte fetch (in de effect hieronder) op de achtergrond loopt.
  const snapshot = loadPrsSnapshot();
  if (snapshot != null) {
    return {
      status: "ready",
      prs: snapshot.prs,
      lastUpdated: new Date(snapshot.lastUpdated),
      refreshError: null,
      viewerLogin: snapshot.viewerLogin,
      // ponytail: niet gepersisteerd in de snapshot, de eerstvolgende echte
      // fetch zet 'm meteen goed; voeg toe als de banner ook op de
      // snapshot-weergave zichtbaar moet zijn.
      truncated: false,
      fromSnapshot: true,
    };
  }
  return { status: "loading" };
}

/**
 * Loads all "@me" PRs and exposes a `refresh()` for the UI. Ververst
 * zichzelf niet op een interval: Cockpit is de enige
 * scheduler (settings-gedreven, incl. "handmatig"). `onAuthError` lets the
 * caller (App) log the user out when the stored token is rejected.
 */
export function usePrs(
  onAuthError: () => void,
  /** Vuurt bij een refresh (niet de allereerste load) zodra een eigen PR's CI
   * net naar rood is omgeslagen; zie `detectCiFlippedToRed`. */
  onCiFlippedRed?: (prs: PullRequest[]) => void,
) {
  const [state, setState] = useState<PrsState>(initialState);
  const [refreshing, setRefreshing] = useState(false);
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;
  const onCiFlippedRedRef = useRef(onCiFlippedRed);
  onCiFlippedRedRef.current = onCiFlippedRed;
  const prsRef = useRef<PullRequest[]>(IS_MOCK ? MOCK_PRS : []);
  // U4: een nieuwe load() terwijl er al één loopt wacht mee op diezelfde
  // promise i.p.v. een concurrente tweede fetch te starten.
  const inFlightRef = useRef<Promise<void> | null>(null);
  // Na een koude start staat de gepersisteerde snapshot van de vórige sessie
  // al in prsRef (via de state-effect hieronder, vóór de eerste echte fetch
  // resolvet): de eerste echte fetch vergelijkt dan tegen gisteren i.p.v.
  // tegen "niks", en meldt CI-rood voor failures die er al stonden vóór deze
  // sessie begon. Skip de melding daarom bij de eerste geslaagde fetch van
  // de sessie; detectCiFlippedToRed zelf blijft ongemoeid.
  const firstLoadDoneRef = useRef(false);

  const runLoad = useCallback(async () => {
    setRefreshing(true);
    try {
      if (IS_MOCK) {
        setState((prev) =>
          prev.status === "ready" ? { ...prev, lastUpdated: new Date() } : prev,
        );
        return;
      }
      setState((prev) =>
        prev.status === "ready" ? prev : { status: "loading" },
      );
      let token: string | null;
      try {
        token = await getToken();
      } catch (error) {
        setState((prev) =>
          nextStateOnLoadError(prev, (error as Error).message),
        );
        return;
      }
      if (token == null || token === "") {
        setState((prev) => nextStateOnLoadError(prev, "Niet ingelogd"));
        return;
      }
      try {
        const {
          prs: rawPrs,
          viewerLogin,
          truncated,
        } = await withRetry(() => fetchAllPrs(token, tauriFetch), {
          attempts: REFRESH_ATTEMPTS,
          delaysMs: REFRESH_DELAYS_MS,
          shouldRetry: shouldRetryRefresh,
        });
        const prs = recentlyMerged.filter(rawPrs);
        const lastUpdated = new Date();
        const flippedRed = detectCiFlippedToRed(prsRef.current, prs);
        if (firstLoadDoneRef.current && flippedRed.length > 0) {
          onCiFlippedRedRef.current?.(flippedRed);
        }
        firstLoadDoneRef.current = true;
        setState({
          status: "ready",
          prs,
          lastUpdated,
          refreshError: null,
          viewerLogin,
          truncated,
          fromSnapshot: false,
        });
        savePrsSnapshot({
          prs,
          viewerLogin,
          lastUpdated: lastUpdated.toISOString(),
        });
      } catch (error) {
        if (error instanceof AuthError) {
          onAuthErrorRef.current();
          return;
        }
        setState((prev) =>
          nextStateOnLoadError(prev, (error as Error).message),
        );
      }
    } finally {
      setRefreshing(false);
    }
  }, []);

  const load = useCallback(() => {
    if (inFlightRef.current != null) return inFlightRef.current;
    const promise = runLoad().finally(() => {
      inFlightRef.current = null;
    });
    inFlightRef.current = promise;
    return promise;
  }, [runLoad]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (state.status === "ready") prsRef.current = state.prs;
  }, [state]);

  const clearRefreshError = useCallback(() => {
    setState((prev) =>
      prev.status === "ready" ? { ...prev, refreshError: null } : prev,
    );
  }, []);

  const mergePr = useCallback(
    async (pr: PullRequest, method: MergeMethod) => {
      if (IS_MOCK) {
        setState((prev) =>
          prev.status === "ready"
            ? { ...prev, prs: prev.prs.filter((p) => p.id !== pr.id) }
            : prev,
        );
        return;
      }
      const token = await getToken();
      if (token == null || token === "") {
        throw new Error("Niet ingelogd");
      }
      try {
        await mergePullRequest(token, pr.id, method, tauriFetch);
      } catch (error) {
        if (error instanceof AuthError) {
          onAuthErrorRef.current();
        }
        // U11: geen writeError hier, de merge-fout heeft met de merge-knop
        // al een zichtbare plek (MergeSection toont 'm inline via de
        // re-throw); een tweede kanaal (de banner) zou 'm nooit filteren en
        // als dode state blijven staan.
        throw error;
      }
      // De search-API is eventually consistent en geeft de gemergede PR vaak
      // nog even als open terug: onthoud 'm als recent gemerged (filtert
      // toekomstige fetch-uitkomsten, B2) en verwijder 'm alvast lokaal.
      // De knop/toast hoeven niet op de refetch te wachten: die loopt fire-
      // and-forget erachteraan.
      recentlyMerged.mark(pr.id);
      setState((prev) =>
        prev.status === "ready"
          ? { ...prev, prs: prev.prs.filter((p) => p.id !== pr.id) }
          : prev,
      );
      void load();
    },
    [load],
  );

  const submitReview = useCallback(
    async (pr: PullRequest, event: ReviewEvent, body: string) => {
      if (IS_MOCK) {
        // ponytail: vaste vertraging i.p.v. een echte fetch, alleen om de
        // busy-state van ReviewActions zichtbaar te maken in ?mock=app.
        await new Promise((resolve) => setTimeout(resolve, 400));
        if (event === "COMMENT") return;
        const nextState = event === "APPROVE" ? "approved" : "changesRequested";
        setState((prev) =>
          prev.status === "ready"
            ? {
                ...prev,
                prs: prev.prs.map((p) =>
                  p.id === pr.id
                    ? applyReviewOutcome(p, nextState, MOCK_ME)
                    : p,
                ),
              }
            : prev,
        );
        return;
      }
      const token = await getToken();
      if (token == null || token === "") {
        throw new Error("Niet ingelogd");
      }
      try {
        await submitReviewMutation(token, pr.id, event, body, tauriFetch);
      } catch (error) {
        if (error instanceof AuthError) {
          onAuthErrorRef.current();
        }
        throw error;
      }
      void load();
    },
    [load],
  );

  return {
    state,
    refresh: load,
    mergePr,
    submitReview,
    clearRefreshError,
    refreshing,
  };
}
