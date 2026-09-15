/**
 * `FetchImpl` die de HTTP-aanvraag door Rust laat doen (`github_request`) in
 * plaats van door de webview.
 *
 * Twee dingen winnen we daarmee. De oorzaak van een mislukte aanvraag komt
 * als kind mee in plaats van als één `TypeError: Load failed`, en de aanvraag
 * valt buiten de CSP van de webview, waardoor het diff-endpoint zijn redirect
 * naar een andere host wel mag volgen.
 *
 * De `signal` uit de init wordt genegeerd: de timeout staat in Rust, op
 * dezelfde 15 seconden die de melding noemt.
 */
import { invoke } from "@tauri-apps/api/core";
import { NetworkError, type NetworkErrorKind } from "./networkError";
import type { FetchImpl } from "./queries";

interface GithubResponse {
  status: number;
  headers: Record<string, string>;
  body: string;
}

type InvokeFn = <T>(
  command: string,
  args: Record<string, unknown>,
) => Promise<T>;

/** Statuscodes waar de Fetch-standaard geen body bij toestaat; `new Response`
 * gooit erop als je er toch een meegeeft. */
const BODYLESS_STATUSES = new Set([101, 103, 204, 205, 304]);

/** Het kind uit `TransportErrorKind` (src-tauri/src/github.rs) naar de kinds
 * die de UI kent. `connect` en `body` zijn beide een verbinding die het niet
 * haalde; het verschil is voor de gebruiker niet zinvol. */
const KIND_FROM_RUST: Record<string, NetworkErrorKind> = {
  timeout: "timeout",
  dns: "dns",
  connect: "connectionLost",
  tls: "tls",
  body: "connectionLost",
  other: "unknown",
};

function toNetworkError(error: unknown): NetworkError {
  const kind = (error as { kind?: string } | null)?.kind;
  return new NetworkError(
    (kind != null && KIND_FROM_RUST[kind]) || "unknown",
    error,
  );
}

export function createTauriFetch(invokeFn: InvokeFn): FetchImpl {
  return async (url, init) => {
    let result: GithubResponse;
    try {
      result = await invokeFn<GithubResponse>("github_request", {
        request: {
          url,
          method: init.method ?? "GET",
          headers: (init.headers as Record<string, string>) ?? {},
          body: typeof init.body === "string" ? init.body : null,
        },
      });
    } catch (error) {
      throw toNetworkError(error);
    }

    return new Response(
      BODYLESS_STATUSES.has(result.status) ? null : result.body,
      { status: result.status, headers: result.headers },
    );
  };
}

export const tauriFetch: FetchImpl = createTauriFetch(invoke);
