import type { PullRequest } from "./domain";
import {
  isSearchTruncated,
  mergePrSources,
  parseSearchResponse,
} from "./parse";

/** The three "@me" searches that feed the cockpit. */
export interface SearchQueries {
  reviewRequested: string;
  assigned: string;
  authored: string;
}

export function buildSearchQueries(): SearchQueries {
  return {
    reviewRequested: "is:open is:pr review-requested:@me archived:false",
    assigned: "is:open is:pr assignee:@me archived:false",
    authored: "is:open is:pr author:@me archived:false",
  };
}

/**
 * Single GraphQL document that runs all three searches (aliased) in one
 * request, each returning the fields needed to build a PullRequest.
 */
export const SEARCH_PRS_QUERY = `
query SearchPrs($reviewRequested: String!, $assigned: String!, $authored: String!) {
  viewer { login }
  reviewRequested: search(query: $reviewRequested, type: ISSUE, first: 100) {
    issueCount
    nodes { ...PrFields }
  }
  assigned: search(query: $assigned, type: ISSUE, first: 100) {
    issueCount
    nodes { ...PrFields }
  }
  authored: search(query: $authored, type: ISSUE, first: 100) {
    issueCount
    nodes { ...PrFields }
  }
}

fragment PrFields on PullRequest {
  id
  repository { nameWithOwner }
  number
  title
  url
  headRefName
  baseRefName
  author { login }
  labels(first: 10) { nodes { name } }
  isDraft
  mergeable
  reviewDecision
  additions
  deletions
  createdAt
  updatedAt
  comments { totalCount }
  reviewThreads(first: 1) { totalCount }
  assignees(first: 20) { nodes { login } }
  reviewRequests(first: 20) {
    nodes { requestedReviewer { ... on User { login } } }
  }
  latestOpinionatedReviews(first: 20) {
    nodes { author { login } state }
  }
  reviews(first: 20) {
    nodes { author { login } submittedAt comments { totalCount } body }
  }
  commits(last: 1) {
    nodes {
      commit {
        statusCheckRollup {
          state
          contexts(first: 20) {
            nodes {
              ... on CheckRun { name conclusion }
              ... on StatusContext { context state }
            }
          }
        }
      }
    }
  }
  agentCommits: commits(last: 10) {
    nodes {
      commit {
        author { user { login } }
      }
    }
  }
}
`;

/** Business error: the token was rejected. */
export class AuthError extends Error {
  constructor(message = "GitHub rejected the token") {
    super(message);
    this.name = "AuthError";
  }
}

/** Technical error: anything else going wrong talking to the GitHub API. */
export class GithubApiError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "GithubApiError";
  }
}

export type FetchImpl = (url: string, init: RequestInit) => Promise<Response>;

/** Leest het `message`-veld uit een JSON-errorbody, of anders de ruwe tekst.
 * Gedeeld door alle GitHub-schrijf-/leespaden (labels.ts, merge.ts, hier). */
export async function responseErrorDetail(response: Response): Promise<string> {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text) as { message?: string };
    if (parsed.message) return parsed.message;
  } catch {
    // Body was geen JSON: gebruik de ruwe tekst.
  }
  return text;
}

/** Rate-limit-context voor een 403/429, als GitHub die headers meestuurt. */
export function rateLimitNote(response: Response): string {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter != null) return ` (retry-after: ${retryAfter}s)`;
  const remaining = response.headers.get("x-ratelimit-remaining");
  if (remaining != null) return ` (x-ratelimit-remaining: ${remaining})`;
  return "";
}

/** Resultaat van een PR-fetch: de PR's plus de ingelogde gebruiker, in één
 * request opgehaald zodat de app-start niet op een aparte /user-call wacht
 * (U2a). */
export interface FetchAllPrsResult {
  prs: PullRequest[];
  viewerLogin: string | null;
  /** True zodra een van de drie searches meer treffers had dan de 100 die
   * werden opgehaald (zie isSearchTruncated in parse.ts). */
  truncated: boolean;
}

const FETCH_TIMEOUT_MS = 15_000;

/** Fetches and merges the three "@me" PR searches in a single request. */
export async function fetchAllPrs(
  token: string,
  fetchImpl: FetchImpl,
): Promise<FetchAllPrsResult> {
  let response: Response;
  try {
    response = await fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        query: SEARCH_PRS_QUERY,
        variables: buildSearchQueries(),
      }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
    });
  } catch (error) {
    if ((error as { name?: string }).name === "TimeoutError") {
      throw new GithubApiError(
        "GitHub reageerde niet binnen 15 seconden, probeer het opnieuw.",
      );
    }
    throw error;
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

  const json: unknown = await response.json();
  const body = json as {
    data?: Record<string, unknown>;
    errors?: { message: string }[];
  };
  const data =
    typeof json === "object" && json !== null ? body.data : undefined;
  const errors =
    typeof json === "object" && json !== null ? body.errors : undefined;

  if (
    errors != null &&
    errors.length > 0 &&
    (data == null ||
      data.reviewRequested == null ||
      data.assigned == null ||
      data.authored == null)
  ) {
    throw new GithubApiError(errors[0]?.message ?? "GitHub GraphQL error");
  }

  const viewer = data?.viewer as { login?: string } | undefined;

  return {
    prs: mergePrSources(
      {
        source: "reviewRequested",
        prs: parseSearchResponse(data?.reviewRequested),
      },
      { source: "assigned", prs: parseSearchResponse(data?.assigned) },
      { source: "authored", prs: parseSearchResponse(data?.authored) },
    ),
    viewerLogin: viewer?.login ?? null,
    truncated:
      isSearchTruncated(data?.reviewRequested) ||
      isSearchTruncated(data?.assigned) ||
      isSearchTruncated(data?.authored),
  };
}
