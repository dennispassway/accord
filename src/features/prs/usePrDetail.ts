import { invoke } from "@tauri-apps/api/core";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { PrDetail } from "../../lib/github/prDetail";
import { fetchPrDetail } from "../../lib/github/prDetail";
import { AuthError } from "../../lib/github/queries";
import {
  MOCK_PR_DETAIL_FALLBACK,
  MOCK_PR_DETAILS,
} from "../../lib/mock/detailFixtures";
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
        const detail = await fetchPrDetail(token, pr.repoId, pr.number, fetch);
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

  return {
    status: state.status,
    detail: state.detail,
    error: state.error,
    retry,
  };
}
