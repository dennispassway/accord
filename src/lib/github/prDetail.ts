/**
 * On-demand detail van één PR voor de inspector-overlay: de diff als platte
 * tekst (REST, mediatype application/vnd.github.diff) en de comments
 * (GraphQL: issue-comments + review-threads). Wordt pas opgehaald bij het
 * openen van de inspector, niet in de bulk-search.
 */
import type { Author, PrNumber, RepoId } from "./domain";
import { deriveAuthor } from "./domain";
import { withNetworkError } from "./networkError";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";

/** Eén reactie: issue-comment of review-comment. bodyText is de platte-tekst
 * variant (fallback); body is de ruwe markdown, inclusief rauwe HTML uit
 * bot-reacties. Render hem alleen via `CommentBody` (commentMarkdown.tsx):
 * raw HTML-parsing staat daar aan, de veiligheid komt uit de tag-allowlist en
 * `sanitizeCreateElement`. */
export interface PrComment {
  author: Author;
  bodyText: string;
  body: string;
  createdAt: string;
}

/** Eén review-thread op een bestand(:regel). line is null bij een thread op
 * een verouderde diff-positie of op bestandsniveau. viewerCanReply/
 * viewerCanResolve/viewerCanUnresolve bepalen welke acties CommentsView
 * toont voor de ingelogde gebruiker. */
export interface ReviewThread {
  id: string;
  path: string;
  line: number | null;
  isResolved: boolean;
  viewerCanReply: boolean;
  viewerCanResolve: boolean;
  viewerCanUnresolve: boolean;
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
      comments(first: 100) { nodes { author { login } bodyText body createdAt } }
      reviewThreads(first: 100) {
        nodes {
          id
          path
          line
          isResolved
          viewerCanReply
          viewerCanResolve
          viewerCanUnresolve
          comments(first: 50) { nodes { author { login } bodyText body createdAt } }
        }
      }
    }
  }
}
`;

const FETCH_TIMEOUT_MS = 15_000;

interface RawCommentNode {
  author?: { login?: string } | null;
  bodyText?: string;
  body?: string;
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
    body: raw.body ?? "",
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
  id?: string;
  path?: string;
  line?: number | null;
  isResolved?: boolean;
  viewerCanReply?: boolean;
  viewerCanResolve?: boolean;
  viewerCanUnresolve?: boolean;
  comments?: { nodes?: unknown };
}

function parseThread(node: unknown): ReviewThread | null {
  if (node == null || typeof node !== "object") return null;
  const raw = node as RawThreadNode;
  if (raw.path == null) return null;
  return {
    id: raw.id ?? "",
    path: raw.path,
    line: raw.line ?? null,
    isResolved: raw.isResolved ?? false,
    viewerCanReply: raw.viewerCanReply ?? false,
    viewerCanResolve: raw.viewerCanResolve ?? false,
    viewerCanUnresolve: raw.viewerCanUnresolve ?? false,
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
  const response = await withNetworkError(() =>
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
    const detail = await withNetworkError(() => responseErrorDetail(response));
    throw new GithubApiError(
      `GitHub rate limit bereikt${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (!response.ok) {
    throw new GithubApiError(`GitHub API responded with ${response.status}`);
  }

  // Een diff is de grootste body die de app leest: juist hier valt een
  // verbinding na de headers nog weg.
  const diff = await withNetworkError(() => response.text());
  return { diff, diffTooLarge: false };
}

async function fetchComments(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  fetchImpl: FetchImpl,
): Promise<{ issueComments: PrComment[]; reviewThreads: ReviewThread[] }> {
  const [owner, name] = repoId.split("/");

  const response = await withNetworkError(() =>
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
    const detail = await withNetworkError(() => responseErrorDetail(response));
    throw new GithubApiError(
      `GitHub rate limit bereikt${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (!response.ok) {
    throw new GithubApiError(`GitHub API responded with ${response.status}`);
  }

  const json: unknown = await withNetworkError(() => response.json());
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
