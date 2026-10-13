/**
 * Regels van één bestand op een commit, voor "context uitklappen" in de diff.
 * Loopt net als de rest via `FetchImpl` (tauriFetch), zie
 * .claude/rules/github-http-via-rust.md.
 */
import type { RepoId } from "./domain";
import { withNetworkError } from "./networkError";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";

const FETCH_TIMEOUT_MS = 15_000;

/** Regels van `path` op commit `sha`, via GET /repos/{repoId}/contents/{path}?ref={sha}
 * met Accept application/vnd.github.raw. */
export async function fetchFileLines(
  token: string,
  repoId: RepoId,
  path: string,
  sha: string,
  fetchImpl: FetchImpl,
): Promise<string[]> {
  const encodedPath = path.split("/").map(encodeURIComponent).join("/");
  const response = await withNetworkError(() =>
    fetchImpl(
      `https://api.github.com/repos/${repoId}/contents/${encodedPath}?ref=${encodeURIComponent(sha)}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github.raw",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    ),
  );

  if (response.status === 401) {
    throw new AuthError();
  }
  if (response.status === 403 || response.status === 429) {
    const detail = await withNetworkError(() => responseErrorDetail(response));
    throw new GithubApiError(
      `GitHub rate limit bereikt${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (!response.ok) {
    const detail = await withNetworkError(() => responseErrorDetail(response));
    throw new GithubApiError(
      `GitHub API responded with ${response.status}: ${detail}`,
    );
  }

  const text = await withNetworkError(() => response.text());
  if (text === "") return [];
  const lines = text.split("\n").map((line) => line.replace(/\r$/, ""));
  // Een trailing newline sluit de laatste regel af, hij begint er geen nieuwe.
  if (lines[lines.length - 1] === "") lines.pop();
  return lines;
}
