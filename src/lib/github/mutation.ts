import { withNetworkError } from "./networkError";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";

/**
 * Voert één GitHub GraphQL-mutatie uit en classificeert de respons: 401 ->
 * AuthError, 403/429 -> GithubApiError met `forbiddenMessage` plus de
 * rate-limit-context, elke andere niet-ok status -> GithubApiError, en een
 * GraphQL-errors-body -> GithubApiError met de servermelding. Gedeeld door
 * review.ts en threads.ts, die dit voorheen los implementeerden en waarbij
 * review.ts de 429-tak miste. Geeft het geparste `data`-veld terug voor
 * aanroepers die de mutatie-respons nodig hebben.
 */
export async function runMutation<T = unknown>(
  token: string,
  query: string,
  variables: Record<string, unknown>,
  fetchImpl: FetchImpl,
  forbiddenMessage: string,
): Promise<T | undefined> {
  const response = await withNetworkError(() =>
    fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
    }),
  );

  if (response.status === 401) {
    throw new AuthError();
  }
  if (!response.ok) {
    const detail = await withNetworkError(() => responseErrorDetail(response));
    if (response.status === 403 || response.status === 429) {
      throw new GithubApiError(
        `${forbiddenMessage}${rateLimitNote(response)}: ${detail}`,
      );
    }
    throw new GithubApiError(
      `GitHub API responded with ${response.status}: ${detail}`,
    );
  }

  const json: unknown = await withNetworkError(() => response.json());
  const body = json as { data?: T; errors?: { message: string }[] };
  const errors =
    typeof json === "object" && json !== null ? body.errors : undefined;
  if (errors != null && errors.length > 0) {
    throw new GithubApiError(errors[0]?.message ?? "GitHub GraphQL error");
  }
  return typeof json === "object" && json !== null ? body.data : undefined;
}
