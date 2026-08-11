import {
  type AgentReview,
  type CiStatus,
  deriveAuthor,
  type Mergeable,
  type PullRequest,
  type RepoId,
  type Reviewer,
  type ReviewerState,
  type ReviewState,
  toPrNumber,
  toRepoId,
} from "./domain";

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === "number" && Number.isFinite(value);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

const MERGEABLE_VALUES: Mergeable[] = ["MERGEABLE", "CONFLICTING", "UNKNOWN"];

function parseMergeable(value: unknown): Mergeable {
  return MERGEABLE_VALUES.includes(value as Mergeable)
    ? (value as Mergeable)
    : "UNKNOWN";
}

function parseReviewState(reviewDecision: unknown): ReviewState {
  switch (reviewDecision) {
    case "APPROVED":
      return { state: "approved" };
    case "CHANGES_REQUESTED":
      return { state: "changesRequested" };
    case "REVIEW_REQUIRED":
      return { state: "reviewRequested" };
    default:
      return { state: "none" };
  }
}

function parseCiStatus(node: Record<string, unknown>): CiStatus {
  const commits =
    isRecord(node.commits) && Array.isArray(node.commits.nodes)
      ? node.commits.nodes
      : [];
  const firstCommit = isRecord(commits[0]) ? commits[0] : undefined;
  const commit =
    firstCommit && isRecord(firstCommit.commit)
      ? firstCommit.commit
      : undefined;
  const rollup =
    commit && isRecord(commit.statusCheckRollup)
      ? commit.statusCheckRollup
      : undefined;
  if (!rollup) return { state: "none" };

  switch (rollup.state) {
    case "SUCCESS":
      return { state: "success" };
    case "PENDING":
    case "EXPECTED":
      return { state: "pending" };
    case "FAILURE":
    case "ERROR": {
      const contextNodes =
        isRecord(rollup.contexts) && Array.isArray(rollup.contexts.nodes)
          ? rollup.contexts.nodes
          : [];
      const failedChecks: string[] = [];
      for (const context of contextNodes) {
        if (!isRecord(context)) continue;
        const isFailed =
          context.conclusion === "FAILURE" ||
          context.conclusion === "ERROR" ||
          context.state === "FAILURE" ||
          context.state === "ERROR";
        if (!isFailed) continue;
        const name = context.name ?? context.context;
        if (isNonEmptyString(name)) failedChecks.push(name);
      }
      return { state: "failure", failedChecks };
    }
    default:
      return { state: "none" };
  }
}

function parsePriority(node: Record<string, unknown>): 1 | 2 | null {
  const labelNodes =
    isRecord(node.labels) && Array.isArray(node.labels.nodes)
      ? node.labels.nodes
      : [];
  const names = new Set(
    labelNodes
      .filter(isRecord)
      .map((label) => label.name)
      .filter(isNonEmptyString)
      .map((name) => name.toUpperCase()),
  );
  if (names.has("P1")) return 1;
  if (names.has("P2")) return 2;
  return null;
}

function nodesOf(field: unknown): unknown[] {
  return isRecord(field) && Array.isArray(field.nodes) ? field.nodes : [];
}

function parseComments(node: Record<string, unknown>): number {
  const issueComments = isRecord(node.comments) ? node.comments.totalCount : 0;
  const reviewComments = isRecord(node.reviewThreads)
    ? node.reviewThreads.totalCount
    : 0;
  return (
    (isFiniteNumber(issueComments) ? issueComments : 0) +
    (isFiniteNumber(reviewComments) ? reviewComments : 0)
  );
}

function parseAssignees(node: Record<string, unknown>): string[] {
  return nodesOf(node.assignees)
    .filter(isRecord)
    .map((assignee) => assignee.login)
    .filter(isNonEmptyString);
}

/**
 * Requested reviewers (no verdict yet) plus reviewers who already left an
 * opinionated review. Dedup on login: a review verdict wins over "pending".
 */
function parseReviewers(node: Record<string, unknown>): Reviewer[] {
  const byLogin = new Map<string, ReviewerState>();

  for (const request of nodesOf(node.reviewRequests)) {
    if (!isRecord(request)) continue;
    const requestedReviewer = request.requestedReviewer;
    const login = isRecord(requestedReviewer)
      ? requestedReviewer.login
      : undefined;
    if (isNonEmptyString(login)) byLogin.set(login, "pending");
  }

  for (const review of nodesOf(node.latestOpinionatedReviews)) {
    if (!isRecord(review)) continue;
    const login = isRecord(review.author) ? review.author.login : undefined;
    if (!isNonEmptyString(login)) continue;
    if (review.state === "APPROVED") byLogin.set(login, "approved");
    if (review.state === "CHANGES_REQUESTED")
      byLogin.set(login, "changesRequested");
  }

  return [...byLogin.entries()].map(([login, state]) => ({ login, state }));
}

/**
 * De agent post reviews met het GitHub-token van de gebruiker, dus de
 * auteur op GitHub is de gebruiker zelf, niet de agent. Om die reviews toch
 * te herkennen zet de agent een onzichtbare marker aan het begin van de
 * review-body: `<!-- accord:claude:commentsOnly -->` of
 * `<!-- accord:codex:withFixes -->`. Groep 2 (de mode) is optioneel, voor
 * oudere of handmatige marker-varianten.
 */
const AGENT_MARKER =
  /<!--\s*accord:(claude|codex)(?::(commentsOnly|withFixes))?\s*-->/;

/** Auteur van een review: eerst via login, anders via de verborgen marker. */
function deriveReviewAuthor(
  login: string | undefined,
  body: unknown,
):
  | { agent: "claude" | "codex"; markerMode?: "commentsOnly" | "withFixes" }
  | undefined {
  if (isNonEmptyString(login)) {
    const author = deriveAuthor(login);
    if (author.kind === "agent") return { agent: author.agent };
  }
  if (!isNonEmptyString(body)) return undefined;
  const match = body.match(AGENT_MARKER);
  if (!match) return undefined;
  return {
    agent: match[1] as "claude" | "codex",
    markerMode: match[2] as "commentsOnly" | "withFixes" | undefined,
  };
}

/**
 * Groepeert reviews en commits per agent-auteur (via deriveAuthor, met de
 * verborgen marker in de review-body als fallback zodra login zelf de
 * gebruiker is). Een agent die ook een commit pushte op de head-branch, of
 * wiens marker "withFixes" meldt, krijgt mode "commentsAndFixes"; anders
 * "commentsOnly".
 */
function parseAgentReviews(node: Record<string, unknown>): AgentReview[] {
  const byAgent = new Map<
    AgentReview["agent"],
    { commentCount: number; submittedAt: string }
  >();
  const markerWithFixes = new Set<AgentReview["agent"]>();

  for (const review of nodesOf(node.reviews)) {
    if (!isRecord(review)) continue;
    const login = isRecord(review.author) ? review.author.login : undefined;
    if (!isNonEmptyString(review.submittedAt)) continue;
    const author = deriveReviewAuthor(
      isNonEmptyString(login) ? login : undefined,
      review.body,
    );
    if (!author) continue;
    if (author.markerMode === "withFixes") markerWithFixes.add(author.agent);

    const commentCount =
      isRecord(review.comments) && isFiniteNumber(review.comments.totalCount)
        ? review.comments.totalCount
        : 0;
    const existing = byAgent.get(author.agent);
    byAgent.set(author.agent, {
      commentCount: (existing?.commentCount ?? 0) + commentCount,
      submittedAt:
        existing && existing.submittedAt > review.submittedAt
          ? existing.submittedAt
          : review.submittedAt,
    });
  }

  const commitCounts = new Map<AgentReview["agent"], number>();
  for (const commitNode of nodesOf(node.agentCommits)) {
    if (!isRecord(commitNode) || !isRecord(commitNode.commit)) continue;
    const commitAuthor = isRecord(commitNode.commit.author)
      ? commitNode.commit.author
      : undefined;
    const user =
      commitAuthor && isRecord(commitAuthor.user)
        ? commitAuthor.user
        : undefined;
    const login = user?.login;
    if (!isNonEmptyString(login)) continue;
    const author = deriveAuthor(login);
    if (author.kind !== "agent") continue;
    commitCounts.set(author.agent, (commitCounts.get(author.agent) ?? 0) + 1);
  }

  return [...byAgent.entries()].map(
    ([agent, { commentCount, submittedAt }]) => {
      const commitCount = commitCounts.get(agent) ?? 0;
      return {
        agent,
        mode:
          commitCount > 0 || markerWithFixes.has(agent)
            ? "commentsAndFixes"
            : "commentsOnly",
        commentCount,
        commitCount,
        submittedAt,
      };
    },
  );
}

function parseNode(node: unknown): PullRequest | undefined {
  if (!isRecord(node)) return undefined;

  const repository = isRecord(node.repository) ? node.repository : undefined;
  const author = isRecord(node.author) ? node.author : undefined;

  const nameWithOwner = repository?.nameWithOwner;
  const login = author?.login;

  if (
    !isNonEmptyString(nameWithOwner) ||
    !isFiniteNumber(node.number) ||
    !isNonEmptyString(node.title) ||
    !isNonEmptyString(node.url) ||
    !isNonEmptyString(node.headRefName) ||
    !isNonEmptyString(node.baseRefName) ||
    !isNonEmptyString(node.createdAt) ||
    !isNonEmptyString(node.updatedAt) ||
    !isNonEmptyString(login) ||
    !isNonEmptyString(node.id)
  ) {
    return undefined;
  }

  let repoId: RepoId;
  try {
    repoId = toRepoId(nameWithOwner);
  } catch {
    return undefined;
  }

  return {
    id: node.id,
    repoId,
    number: toPrNumber(node.number),
    title: node.title,
    url: node.url,
    headRef: node.headRefName,
    baseRef: node.baseRefName,
    author: deriveAuthor(login),
    ciStatus: parseCiStatus(node),
    reviewState: parseReviewState(node.reviewDecision),
    isDraft: node.isDraft === true,
    mergeable: parseMergeable(node.mergeable),
    priority: parsePriority(node),
    createdAt: node.createdAt,
    updatedAt: node.updatedAt,
    additions: isFiniteNumber(node.additions) ? node.additions : 0,
    deletions: isFiniteNumber(node.deletions) ? node.deletions : 0,
    comments: parseComments(node),
    reviewers: parseReviewers(node),
    agentReviews: parseAgentReviews(node),
    assignees: parseAssignees(node),
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
  };
}

/**
 * True als een search-response meer resultaten had dan er `nodes` zijn
 * teruggegeven (afgekapt door de `first: 100` in SEARCH_PRS_QUERY). Ontbreekt
 * `issueCount` (oude fixtures/mocks), dan is er niets om af te kappen op.
 */
export function isSearchTruncated(json: unknown): boolean {
  if (!isRecord(json) || !isFiniteNumber(json.issueCount)) return false;
  return json.issueCount > nodesOf(json).length;
}

/** Defensively parses a single search result's `{ nodes }` shape. */
export function parseSearchResponse(json: unknown): PullRequest[] {
  if (!isRecord(json) || !Array.isArray(json.nodes)) return [];
  const prs: PullRequest[] = [];
  for (const node of json.nodes) {
    const pr = parseNode(node);
    if (pr) prs.push(pr);
  }
  return prs;
}

type PrSource = "reviewRequested" | "assigned" | "authored";

export interface PrSourceList {
  source: PrSource;
  prs: PullRequest[];
}

function keyOf(pr: PullRequest): string {
  return `${pr.repoId}#${pr.number}`;
}

/** Dedupes PRs across the three searches and sets the "from me" flags. */
export function mergePrSources(...lists: PrSourceList[]): PullRequest[] {
  const byKey = new Map<string, PullRequest>();

  for (const { source, prs } of lists) {
    for (const pr of prs) {
      const key = keyOf(pr);
      const existing = byKey.get(key) ?? pr;
      byKey.set(key, {
        ...existing,
        reviewRequestedFromMe:
          existing.reviewRequestedFromMe || source === "reviewRequested",
        assignedToMe: existing.assignedToMe || source === "assigned",
        authoredByMe: existing.authoredByMe || source === "authored",
      });
    }
  }

  return [...byKey.values()];
}
