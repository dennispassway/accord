import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PrNumber, PullRequest, RepoId } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { setPriority } from "../../lib/github/labels";
import type { MergeMethod } from "../../lib/github/merge";
import { mergePullRequest } from "../../lib/github/merge";
import { AuthError, fetchAllPrs } from "../../lib/github/queries";
import { MOCK_ME, MOCK_PRS } from "../../lib/mock/fixtures";
import { isMockApp, mockMode } from "../../lib/mock/mode";
import { loadPrsSnapshot, savePrsSnapshot } from "../../lib/prsSnapshot";

const IS_MOCK = isMockApp(mockMode());

// ponytail: mock-only foutpad voor QA, vaste PR/waarde zoals in de
// designdemo (docs/design-v2/pr-cockpit-v2.dc.html, regel 946).
const MOCK_FAIL_PRIORITY_REPO = toRepoId("acme/knowledge-base");
const MOCK_FAIL_PRIORITY_NR = toPrNumber(167);

interface PrWriteError {
  scope: "priority" | "merge";
  text: string;
  /** `${repoId}#${prNumber}`, zoals keyOfPr/prKeyOf elders in de app. */
  prKey: string;
}

export type PrsState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | {
      status: "ready";
      prs: PullRequest[];
      lastUpdated: Date;
      writeError: PrWriteError | null;
      /** Fout van een achtergrond-refresh; de lijst blijft staan, dit wordt
       * als wegklikbare banner getoond (zie Cockpit.tsx). */
      refreshError: string | null;
      /** De ingelogde gebruiker, meegekomen in dezelfde PR-fetch (U2a) of
       * uit de laatste snapshot (U2b); `null` zolang geen van beide er is. */
      viewerLogin: string | null;
      /** True zodra een van de drie "@me"-searches meer dan 100 treffers
       * had: de lijst is dan afgekapt, zie Cockpit's banner. */
      truncated: boolean;
    };

async function getToken(): Promise<string | null> {
  return invoke<string | null>("get_token");
}

/** Een refresh-fout mag de al geladen lijst niet wegvegen: blijft de state
 * `ready`, dan wordt de fout ernaast getoond in plaats van de state te
 * vervangen. Alleen de allereerste load (nog geen data) toont het volledige
 * foutscherm. */
export function nextStateOnLoadError(
  prev: PrsState,
  message: string,
): PrsState {
  if (prev.status === "ready") return { ...prev, refreshError: message };
  return { status: "error", message };
}

/** Guard voor de U1 visibilitychange-refresh: niet vaker dan om de
 * `minIntervalMs` (default 30s), ongeacht hoe vaak het venster zichtbaar
 * wordt. */
export function shouldRefreshOnVisible(
  lastRefreshAt: number,
  now: number,
  minIntervalMs = 30_000,
): boolean {
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
      writeError: null,
      refreshError: null,
      viewerLogin: MOCK_ME,
      // Visuele QA van de afkap-banner: ?mock=app&truncated
      truncated: new URLSearchParams(window.location.search).has("truncated"),
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
      writeError: null,
      refreshError: null,
      viewerLogin: snapshot.viewerLogin,
      // ponytail: niet gepersisteerd in de snapshot, de eerstvolgende echte
      // fetch zet 'm meteen goed; voeg toe als de banner ook op de
      // snapshot-weergave zichtbaar moet zijn.
      truncated: false,
    };
  }
  return { status: "loading" };
}

/**
 * Loads all "@me" PRs and exposes a `refresh()` and `updatePriority()` for
 * the UI. Ververst zichzelf niet op een interval: Cockpit is de enige
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
        } = await fetchAllPrs(token, fetch);
        const prs = recentlyMerged.filter(rawPrs);
        const lastUpdated = new Date();
        // De omslag-detectie vergelijkt de vorige lijst met de nieuwe, dus
        // die moet vóór het bijwerken van prsRef gebeuren.
        const flippedRed = detectCiFlippedToRed(prsRef.current, prs);
        if (firstLoadDoneRef.current && flippedRed.length > 0) {
          onCiFlippedRedRef.current?.(flippedRed);
        }
        firstLoadDoneRef.current = true;
        // Direct bijwerken (niet pas via het effect op `state` hieronder):
        // stackMerge's refreshPr roept findPr() meteen na `await refresh()`
        // aan en mag niet op een React-rendercyclus hoeven wachten.
        prsRef.current = prs;
        setState({
          status: "ready",
          prs,
          lastUpdated,
          writeError: null,
          refreshError: null,
          viewerLogin,
          truncated,
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

  const updatePriority = useCallback(
    async (repoId: RepoId, prNumber: PrNumber, priority: 1 | 2 | null) => {
      const prKey = `${repoId}#${prNumber}`;
      const previousPriority =
        prsRef.current.find(
          (pr) => pr.repoId === repoId && pr.number === prNumber,
        )?.priority ?? null;
      setState((prev) => {
        if (prev.status !== "ready") return prev;
        return {
          ...prev,
          writeError: null,
          prs: prev.prs.map((pr) =>
            pr.repoId === repoId && pr.number === prNumber
              ? { ...pr, priority }
              : pr,
          ),
        };
      });
      if (IS_MOCK) {
        if (
          repoId === MOCK_FAIL_PRIORITY_REPO &&
          prNumber === MOCK_FAIL_PRIORITY_NR &&
          priority === 1
        ) {
          const message = "Label P1 zetten mislukt (403)";
          setState((prev) =>
            prev.status === "ready"
              ? {
                  ...prev,
                  prs: prev.prs.map((pr) =>
                    pr.repoId === repoId && pr.number === prNumber
                      ? { ...pr, priority: previousPriority }
                      : pr,
                  ),
                  writeError: { scope: "priority", text: message, prKey },
                }
              : prev,
          );
          throw new Error(message);
        }
        return;
      }

      // Een mislukte write mag de ready-state (en dus de PR-lijst) niet
      // wegvegen: toon de fout ernaast in plaats van de state te vervangen.
      const fail = (message: string) =>
        setState((prev) =>
          prev.status === "ready"
            ? {
                ...prev,
                writeError: { scope: "priority", text: message, prKey },
              }
            : { status: "error", message },
        );

      let token: string | null;
      try {
        token = await getToken();
      } catch (error) {
        fail((error as Error).message);
        throw error;
      }
      if (token == null || token === "") {
        const message = "Niet ingelogd";
        fail(message);
        throw new Error(message);
      }

      try {
        await setPriority(
          token,
          repoId,
          prNumber,
          priority,
          previousPriority,
          fetch,
        );
      } catch (error) {
        if (error instanceof AuthError) {
          onAuthErrorRef.current();
          return;
        }
        // Roll back the optimistic update, keeping the rest of the list.
        setState((prev) => {
          if (prev.status !== "ready") return prev;
          return {
            ...prev,
            prs: prev.prs.map((pr) =>
              pr.repoId === repoId && pr.number === prNumber
                ? { ...pr, priority: previousPriority }
                : pr,
            ),
          };
        });
        fail((error as Error).message);
        throw error;
      }
    },
    [],
  );

  /** Zoekt een PR op in de meest recente lijst (na een `await refresh()`),
   * voor stackMerge's refreshPr. `prKey` in dezelfde vorm als keyOfPr/
   * prKeyOf elders (`${repoId}#${prNumber}`). */
  const findPr = useCallback((prKey: string): PullRequest | null => {
    return (
      prsRef.current.find((pr) => `${pr.repoId}#${pr.number}` === prKey) ?? null
    );
  }, []);

  const clearWriteError = useCallback(() => {
    setState((prev) =>
      prev.status === "ready" ? { ...prev, writeError: null } : prev,
    );
  }, []);

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
        await mergePullRequest(token, pr.id, method, fetch);
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

  return {
    state,
    refresh: load,
    updatePriority,
    mergePr,
    clearWriteError,
    clearRefreshError,
    refreshing,
    findPr,
  };
}
