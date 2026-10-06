import { type RetryOptions, withRetry } from "../retry";
import type { PullRequest } from "./domain";
import { withNetworkError } from "./networkError";
import {
  isSearchTruncated,
  mergePrSources,
  parseSearchIds,
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
 * De drie searches (gealiast) in één request, maar alleen met de node-id's.
 * Alle velden in dezelfde query liepen met een paar dozijn PR's tegen GitHubs
 * rekengrens van 10 seconden aan (502 na ~10,7 s); de id's alleen kosten ~2,5 s.
 */
export const SEARCH_PR_IDS_QUERY = `
query SearchPrIds($reviewRequested: String!, $assigned: String!, $authored: String!) {
  viewer { login }
  reviewRequested: search(query: $reviewRequested, type: ISSUE, first: 100) {
    issueCount
    nodes { ... on PullRequest { id } }
  }
  assigned: search(query: $assigned, type: ISSUE, first: 100) {
    issueCount
    nodes { ... on PullRequest { id } }
  }
  authored: search(query: $authored, type: ISSUE, first: 100) {
    issueCount
    nodes { ... on PullRequest { id } }
  }
}
`;

/** De velden voor een PullRequest, per batch id's uit SEARCH_PR_IDS_QUERY. */
export const PR_NODES_QUERY = `
query PrNodes($ids: [ID!]!) {
  nodes(ids: $ids) { ...PrFields }
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
  isDraft
  mergeable
  mergeStateStatus
  reviewDecision
  additions
  deletions
  createdAt
  updatedAt
  comments { totalCount }
  reviewThreads(first: 100) { totalCount nodes { isResolved } }
  assignees(first: 20) { nodes { login } }
  reviewRequests(first: 20) {
    nodes { requestedReviewer { ... on User { login } } }
  }
  latestOpinionatedReviews(first: 20) {
    nodes { author { login } state }
  }
  reviews(last: 50) {
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
  constructor(
    message: string,
    /** HTTP-status als de fout een niet-ok antwoord was. */
    readonly status?: number,
  ) {
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

/** PR's per `nodes(ids:)`-request. Gemeten op 48 PR's: alles in één request
 * 9,6 s (vlak onder GitHubs grens van 10 s), per 10 2,1-3,0 s. */
const PR_BATCH_SIZE = 10;

/** Een gateway-fout van GitHub zelf (een request dat over zijn rekentijd
 * ging, een hapering in hun proxy): een kleine batch slaagt bij een tweede
 * poging meestal wel. */
const GATEWAY_STATUSES = new Set([502, 503, 504]);
const GATEWAY_ATTEMPTS = 3;
const GATEWAY_DELAYS_MS = [1000, 3000];

interface GraphqlBody {
  data?: Record<string, unknown>;
  errors?: { message: string }[];
}

async function postGraphql(
  token: string,
  fetchImpl: FetchImpl,
  query: string,
  variables: object,
): Promise<GraphqlBody> {
  const startedAt = Date.now();
  const response = await withNetworkError(() =>
    fetchImpl("https://api.github.com/graphql", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ query, variables }),
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
      response.status,
    );
  }
  if (!response.ok) {
    // Request-id en duur maken een volgende 5xx herleidbaar: rond 10 s is het
    // GitHubs rekengrens, met het id kan GitHub support het request terugvinden.
    const requestId = response.headers.get("x-github-request-id") ?? "onbekend";
    throw new GithubApiError(
      `GitHub API responded with ${response.status} (request-id ${requestId}, ${Date.now() - startedAt} ms)`,
      response.status,
    );
  }

  // De body loopt over dezelfde verbinding als de headers: valt die na het
  // antwoord weg, dan gooit dit en niet de fetch hierboven.
  const json: unknown = await withNetworkError(() => response.json());
  return typeof json === "object" && json !== null ? (json as GraphqlBody) : {};
}

function isGatewayError(error: unknown): boolean {
  return (
    error instanceof GithubApiError &&
    error.status != null &&
    GATEWAY_STATUSES.has(error.status)
  );
}

function chunk<T>(items: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < items.length; i += size) {
    chunks.push(items.slice(i, i + size));
  }
  return chunks;
}

/**
 * Haalt de drie "@me"-searches op in twee stappen: eerst alleen de id's, dan
 * de velden per batch van PR_BATCH_SIZE, parallel. Zo hangt de duur van één
 * request af van de batchgrootte en niet van hoeveel PR's iemand open heeft.
 * Faalt één batch definitief, dan faalt het geheel: een halve lijst zou PR's
 * stil uit de cockpit laten vallen.
 */
export async function fetchAllPrs(
  token: string,
  fetchImpl: FetchImpl,
  options: Pick<RetryOptions, "sleep"> = {},
): Promise<FetchAllPrsResult> {
  const post = (query: string, variables: object) =>
    withRetry(() => postGraphql(token, fetchImpl, query, variables), {
      ...options,
      attempts: GATEWAY_ATTEMPTS,
      delaysMs: GATEWAY_DELAYS_MS,
      shouldRetry: isGatewayError,
    });

  const { data, errors } = await post(
    SEARCH_PR_IDS_QUERY,
    buildSearchQueries(),
  );

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
  const reviewRequestedIds = parseSearchIds(data?.reviewRequested);
  const assignedIds = parseSearchIds(data?.assigned);
  const authoredIds = parseSearchIds(data?.authored);
  // assigned en authored overlappen sterk: elke PR maar één keer ophalen.
  const uniqueIds = [
    ...new Set([...reviewRequestedIds, ...assignedIds, ...authoredIds]),
  ];

  // ponytail: geen concurrency-limiet; 300 PR's (3 x first: 100) geeft 30
  // requests tegelijk, onder GitHubs richtlijn van 100. Knelt een secondary
  // rate limit, zet er dan een pool van een paar tegelijk op.
  const batches = await Promise.all(
    chunk(uniqueIds, PR_BATCH_SIZE).map(async (ids) => ({
      ids,
      body: await post(PR_NODES_QUERY, { ids }),
    })),
  );
  const nodeById = new Map<string, unknown>();
  for (const batch of batches) {
    const nodes = batch.body.data?.nodes;
    if (!Array.isArray(nodes)) {
      throw new GithubApiError(
        batch.body.errors?.[0]?.message ?? "GitHub GraphQL error",
      );
    }
    // GitHub geeft de nodes in de volgorde van de id's, met null voor een PR
    // die intussen weg of ontoegankelijk is; parseSearchResponse slaat die over.
    nodes.forEach((node, i) => {
      const id = batch.ids[i];
      if (id != null) nodeById.set(id, node);
    });
  }
  const prsFor = (ids: string[]) =>
    parseSearchResponse({ nodes: ids.map((id) => nodeById.get(id) ?? null) });

  return {
    prs: mergePrSources(
      { source: "reviewRequested", prs: prsFor(reviewRequestedIds) },
      { source: "assigned", prs: prsFor(assignedIds) },
      { source: "authored", prs: prsFor(authoredIds) },
    ),
    viewerLogin: viewer?.login ?? null,
    truncated:
      isSearchTruncated(data?.reviewRequested) ||
      isSearchTruncated(data?.assigned) ||
      isSearchTruncated(data?.authored),
  };
}
