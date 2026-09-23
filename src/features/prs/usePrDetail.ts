import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import { deriveAuthor } from "../../lib/github/domain";
import type { PrComment, PrDetail } from "../../lib/github/prDetail";
import { fetchPrDetail } from "../../lib/github/prDetail";
import { AuthError } from "../../lib/github/queries";
import { tauriFetch } from "../../lib/github/tauriFetch";
import { replyToThread, setThreadResolved } from "../../lib/github/threads";
import {
  MOCK_PR_DETAIL_FALLBACK,
  MOCK_PR_DETAILS,
} from "../../lib/mock/detailFixtures";
import { MOCK_ME } from "../../lib/mock/fixtures";
import { isMockApp, mockMode } from "../../lib/mock/mode";
import { keyOfPr } from "./PrList";

const IS_MOCK = isMockApp(mockMode());
// QA-foutpad voor de inspector: ?mock=app&detailfout dwingt altijd een
// foutstatus af, net als usePrs's eigen ?mock=app&truncated.
const MOCK_DETAIL_FOUT =
  IS_MOCK &&
  typeof window !== "undefined" &&
  new URLSearchParams(window.location.search).has("detailfout");

export interface PrDetailState {
  status: "idle" | "loading" | "error" | "ready";
  detail: PrDetail | null;
  error: string | null;
}

const IDLE_STATE: PrDetailState = { status: "idle", detail: null, error: null };

/** Mockmodus-uitkomst voor prKey: het QA-foutpad wint altijd, anders een
 * fixture-lookup met fallback voor PR's zonder eigen fixture. */
export function mockDetailState(
  prKey: string,
  detailFout: boolean,
): PrDetailState {
  if (detailFout) {
    return {
      status: "error",
      detail: null,
      error: "Testfout via ?mock=app&detailfout",
    };
  }
  return {
    status: "ready",
    detail: MOCK_PR_DETAILS[prKey] ?? MOCK_PR_DETAIL_FALLBACK,
    error: null,
  };
}

/** Cache-hit voor prKey als ready-state, of null als er nog gefetcht moet
 * worden. Puur voor testbaarheid van de cachebeslissing. */
export function detailFromCache(
  cache: Map<string, PrDetail>,
  prKey: string,
): PrDetailState | null {
  const cached = cache.get(prKey);
  return cached == null
    ? null
    : { status: "ready", detail: cached, error: null };
}

/** Voegt comment toe aan de thread met threadId (elders ongewijzigd). Puur,
 * voor testbaarheid los van de hook. */
export function applyReply(
  detail: PrDetail,
  threadId: string,
  comment: PrComment,
): PrDetail {
  return {
    ...detail,
    reviewThreads: detail.reviewThreads.map((thread) =>
      thread.id === threadId
        ? { ...thread, comments: [...thread.comments, comment] }
        : thread,
    ),
  };
}

/** Zet isResolved op de thread met threadId (elders ongewijzigd). Puur, voor
 * testbaarheid los van de hook. */
export function applyResolved(
  detail: PrDetail,
  threadId: string,
  resolved: boolean,
): PrDetail {
  return {
    ...detail,
    reviewThreads: detail.reviewThreads.map((thread) =>
      thread.id === threadId
        ? {
            ...thread,
            isResolved: resolved,
            viewerCanResolve: !resolved,
            viewerCanUnresolve: resolved,
          }
        : thread,
    ),
  };
}

/** Beslissing na een geslaagde mutatie waarvan de refetch faalt: alleen de
 * mutatie zelf mag een foutstatus opleveren, anders stuurt de UI de
 * gebruiker naar een retry die de mutatie dubbel uitvoert (bijvoorbeeld een
 * reactie die twee keer op GitHub belandt). De lokale wijziging wordt
 * toegepast op de laatst bekende detail en er wordt geen fout gemeld. Puur,
 * voor testbaarheid los van de hook. */
export function stateAfterFailedRefetch(
  detail: PrDetail | null,
  applyLocally: (detail: PrDetail) => PrDetail,
): PrDetailState | null {
  if (detail == null) return null;
  return { status: "ready", detail: applyLocally(detail), error: null };
}

/**
 * Haalt de diff en comments van één PR op, met een cache per prKey zodat een
 * cache-hit nooit opnieuw fetcht. Mockmodus (`?mock=app`) gebruikt fixtures
 * i.p.v. netwerk. `onAuthError` laat de caller (PrInspector/Cockpit) de
 * gebruiker uitloggen als het bewaarde token wordt afgewezen.
 */
export function usePrDetail(pr: PullRequest, onAuthError: () => void) {
  const cacheRef = useRef<Map<string, PrDetail>>(new Map());
  const [state, setState] = useState<PrDetailState>(IDLE_STATE);
  const [retryToken, setRetryToken] = useState(0);
  const prKey = keyOfPr(pr);
  const onAuthErrorRef = useRef(onAuthError);
  onAuthErrorRef.current = onAuthError;
  // Een refetch na een mutatie mag de state alleen zetten als hij de laatste
  // is en de gebruiker nog op dezelfde PR staat: anders landt een trager
  // antwoord over een nieuwer, of de detail van PR A onder PR B.
  const currentKeyRef = useRef(prKey);
  currentKeyRef.current = prKey;
  const mutationSeqRef = useRef(0);

  // biome-ignore lint/correctness/useExhaustiveDependencies: retryToken triggert alleen een herfetch, de body leest 'm niet; pr zelf wordt via repoId/number bewaakt zodat een nieuw pr-object per poll-refresh geen onnodige herfetch triggert
  useEffect(() => {
    if (IS_MOCK) {
      setState(mockDetailState(prKey, MOCK_DETAIL_FOUT));
      return;
    }

    const cached = detailFromCache(cacheRef.current, prKey);
    if (cached != null) {
      setState(cached);
      return;
    }

    let cancelled = false;
    setState({ status: "loading", detail: null, error: null });

    void (async () => {
      let token: string | null;
      try {
        token = await invoke<string | null>("get_token");
      } catch (error) {
        if (!cancelled) {
          setState({
            status: "error",
            detail: null,
            error: (error as Error).message,
          });
        }
        return;
      }
      if (token == null || token === "") {
        if (!cancelled) {
          setState({
            status: "error",
            detail: null,
            error: "Geen GitHub-token gevonden.",
          });
        }
        return;
      }
      try {
        const detail = await fetchPrDetail(
          token,
          pr.repoId,
          pr.number,
          tauriFetch,
        );
        // Een afgeronde fetch mag nooit weggegooid worden: de cache-entry
        // wordt altijd gezet, ook als deze effect-run inmiddels vervangen is.
        cacheRef.current.set(prKey, detail);
        if (cancelled) return;
        setState({ status: "ready", detail, error: null });
      } catch (error) {
        if (error instanceof AuthError) {
          onAuthErrorRef.current();
          return;
        }
        if (!cancelled) {
          setState({
            status: "error",
            detail: null,
            error: (error as Error).message,
          });
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [pr.repoId, pr.number, prKey, retryToken]);

  const retry = useCallback(() => {
    if (prKey != null) cacheRef.current.delete(prKey);
    setRetryToken((t) => t + 1);
  }, [prKey]);

  /** Na een geslaagde mutatie is de lokale cache-entry voor deze PR stale:
   * hij wordt verwijderd en de detail opnieuw gefetcht zodat het antwoord
   * altijd de servertoestand toont. */
  const refetchAfterMutation = useCallback(
    async (token: string, seq: number) => {
      cacheRef.current.delete(prKey);
      const detail = await fetchPrDetail(
        token,
        pr.repoId,
        pr.number,
        tauriFetch,
      );
      if (seq !== mutationSeqRef.current) return;
      cacheRef.current.set(prKey, detail);
      if (currentKeyRef.current !== prKey) return;
      setState({ status: "ready", detail, error: null });
    },
    [prKey, pr.repoId, pr.number],
  );

  const withToken = useCallback(
    async (
      mutate: (token: string) => Promise<void>,
      applyLocally: (detail: PrDetail) => PrDetail,
    ) => {
      const token = await invoke<string | null>("get_token");
      if (token == null || token === "") {
        throw new Error("Geen GitHub-token gevonden.");
      }
      try {
        await mutate(token);
      } catch (error) {
        if (error instanceof AuthError) {
          onAuthErrorRef.current();
        }
        throw error;
      }
      // De mutatie is al geslaagd; de refetch is best-effort. Faalt hij, dan
      // mag dat niet als mutatiefout naar de gebruiker (zie
      // stateAfterFailedRefetch hierboven).
      const seq = ++mutationSeqRef.current;
      const mutatedKey = currentKeyRef.current;
      try {
        await refetchAfterMutation(token, seq);
      } catch {
        if (currentKeyRef.current !== mutatedKey) return;
        setState(
          (prev) => stateAfterFailedRefetch(prev.detail, applyLocally) ?? prev,
        );
      }
    },
    [refetchAfterMutation],
  );

  const reply = useCallback(
    async (threadId: string, body: string) => {
      if (IS_MOCK) {
        setState((prev) => {
          if (prev.detail == null) return prev;
          const comment: PrComment = {
            author: deriveAuthor(MOCK_ME),
            bodyText: body,
            body,
            createdAt: new Date().toISOString(),
          };
          return {
            ...prev,
            detail: applyReply(prev.detail, threadId, comment),
          };
        });
        return;
      }
      let posted: PrComment | null = null;
      await withToken(
        async (token) => {
          posted = await replyToThread(token, threadId, body, tauriFetch);
        },
        (detail) =>
          posted == null ? detail : applyReply(detail, threadId, posted),
      );
    },
    [withToken],
  );

  const setResolved = useCallback(
    async (threadId: string, resolved: boolean) => {
      if (IS_MOCK) {
        setState((prev) => {
          if (prev.detail == null) return prev;
          return {
            ...prev,
            detail: applyResolved(prev.detail, threadId, resolved),
          };
        });
        return;
      }
      await withToken(
        (token) => setThreadResolved(token, threadId, resolved, tauriFetch),
        (detail) => applyResolved(detail, threadId, resolved),
      );
    },
    [withToken],
  );

  return {
    status: state.status,
    detail: state.detail,
    error: state.error,
    retry,
    reply,
    setResolved,
  };
}
