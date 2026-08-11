/**
 * On-demand detail van één PR voor de inspector-overlay: de diff als platte
 * tekst (REST, mediatype application/vnd.github.diff) en de comments
 * (GraphQL: issue-comments + review-threads). Wordt pas opgehaald bij het
 * openen van de inspector, niet in de bulk-search.
 */
import type { Author, PrNumber, RepoId } from "./domain";
import { deriveAuthor } from "./domain";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";

/** Eén reactie: issue-comment of review-comment. bodyText is platte tekst
 * (geen markdown/HTML), bewust: veilig te renderen zonder sanitizer. */
export interface PrComment {
  author: Author;
  bodyText: string;
  createdAt: string;
}

/** Eén review-thread op een bestand(:regel). line is null bij een thread op
 * een verouderde diff-positie of op bestandsniveau. */
export interface ReviewThread {
  path: string;
  line: number | null;
  isResolved: boolean;
  comments: PrComment[];
}

export interface PrDetail {
  /** Unified diff als platte tekst; leeg als diffTooLarge. */
  diff: string;
  /** True als GitHub de diff weigerde (406: te groot). */
  diffTooLarge: boolean;
  issueComments: PrComment[];
  reviewThreads: ReviewThread[];
}

const PR_DETAIL_QUERY = `
query PrDetail($owner: String!, $name: String!, $number: Int!) {
  repository(owner: $owner, name: $name) {
    pullRequest(number: $number) {
      comments(first: 100) { nodes { author { login } bodyText createdAt } }
      reviewThreads(first: 100) {
        nodes {
          path
          line
          isResolved
          comments(first: 50) { nodes { author { login } bodyText createdAt } }
        }
      }
    }
  }
}
`;

const FETCH_TIMEOUT_MS = 15_000;

async function withTimeoutError<T>(promise: Promise<T>): Promise<T> {
  try {
    return await promise;
  } catch (error) {
    if ((error as { name?: string }).name === "TimeoutError") {
      throw new GithubApiError(
        "GitHub reageerde niet binnen 15 seconden, probeer het opnieuw.",
      );
    }
    throw error;
  }
}

interface RawCommentNode {
  author?: { login?: string } | null;
  bodyText?: string;
  createdAt?: string;
}

function parseComment(node: unknown): PrComment | null {
  if (node == null || typeof node !== "object") return null;
  const raw = node as RawCommentNode;
  // Een comment zonder createdAt geeft met een ""-fallback "NaN min geleden"
  // in de UI; sla 'm dan liever over dan een onbruikbare timestamp te tonen.
  if (raw.createdAt == null) return null;
  return {
    author: deriveAuthor(raw.author?.login ?? "ghost"),
    bodyText: raw.bodyText ?? "",
    createdAt: raw.createdAt,
  };
}

function parseComments(nodes: unknown): PrComment[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map(parseComment)
    .filter((comment): comment is PrComment => comment != null);
}

interface RawThreadNode {
  path?: string;
  line?: number | null;
  isResolved?: boolean;
  comments?: { nodes?: unknown };
}

function parseThread(node: unknown): ReviewThread | null {
  if (node == null || typeof node !== "object") return null;
  const raw = node as RawThreadNode;
  if (raw.path == null) return null;
  return {
    path: raw.path,
    line: raw.line ?? null,
    isResolved: raw.isResolved ?? false,
    comments: parseComments(raw.comments?.nodes),
  };
}

function parseThreads(nodes: unknown): ReviewThread[] {
  if (!Array.isArray(nodes)) return [];
  return nodes
    .map(parseThread)
    .filter((thread): thread is ReviewThread => thread != null);
}

async function fetchDiff(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  fetchImpl: FetchImpl,
): Promise<{ diff: string; diffTooLarge: boolean }> {
  const response = await withTimeoutError(
    fetchImpl(`https://api.github.com/repos/${repoId}/pulls/${prNumber}`, {
      method: "GET",
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/vnd.github.diff",
        "X-GitHub-Api-Version": "2022-11-28",
      },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );

  if (response.status === 406) {
    return { diff: "", diffTooLarge: true };
  }
  if (response.status === 401) {
    throw new AuthError();
  }
  if (response.status === 403 || response.status === 429) {
    const detail = await responseErrorDetail(response);
    throw new GithubApiError(
      `GitHub rate limit bereikt${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (!response.ok) {
    throw new GithubApiError(`GitHub API responded with ${response.status}`);
  }

  return { diff: await response.text(), diffTooLarge: false };
}

async function fetchComments(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  fetchImpl: FetchImpl,
): Promise<{ issueComments: PrComment[]; reviewThreads: ReviewThread[] }> {
  const [owner, name] = repoId.split("/");

  const response = await withTimeoutError(
    fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: PR_DETAIL_QUERY,
        variables: { owner, name, number: prNumber },
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    }),
  );

  if (response.status === 401) {
    throw new AuthError();
  }
  if (response.status === 403 || response.status === 429) {
    const detail = await responseErrorDetail(response);
    throw new GithubApiError(
      `GitHub rate limit bereikt${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (!response.ok) {
    throw new GithubApiError(`GitHub API responded with ${response.status}`);
  }

  const json: unknown = await response.json();
  const body = json as {
    data?: {
      repository?: {
        pullRequest?: {
          comments?: { nodes?: unknown };
          reviewThreads?: { nodes?: unknown };
        } | null;
      } | null;
    };
    errors?: { message: string }[];
  };
  const pullRequest = body.data?.repository?.pullRequest;

  if (body.errors != null && body.errors.length > 0 && pullRequest == null) {
    throw new GithubApiError(body.errors[0]?.message ?? "GitHub GraphQL error");
  }

  const issueComments = parseComments(pullRequest?.comments?.nodes).sort(
    (a, b) => a.createdAt.localeCompare(b.createdAt),
  );
  const reviewThreads = parseThreads(pullRequest?.reviewThreads?.nodes);

  return { issueComments, reviewThreads };
}

/** Haalt de diff en comments van één PR parallel op. */
export async function fetchPrDetail(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  fetchImpl: FetchImpl,
): Promise<PrDetail> {
  const [{ diff, diffTooLarge }, { issueComments, reviewThreads }] =
    await Promise.all([
      fetchDiff(token, repoId, prNumber, fetchImpl),
      fetchComments(token, repoId, prNumber, fetchImpl),
    ]);

  return { diff, diffTooLarge, issueComments, reviewThreads };
}
