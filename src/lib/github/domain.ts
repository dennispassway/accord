/**
 * Domain model for the PR cockpit. Branded types and discriminated unions
 * keep invalid states unrepresentable.
 */

declare const repoIdBrand: unique symbol;
declare const prNumberBrand: unique symbol;

/** Repo identifier in "owner/name" form. */
export type RepoId = string & { readonly [repoIdBrand]: true };

/** PR number, branded to avoid mixing with arbitrary numbers. */
export type PrNumber = number & { readonly [prNumberBrand]: true };

/** Builds a RepoId from GitHub's "owner/name" format. Throws on malformed input. */
export function toRepoId(nameWithOwner: string): RepoId {
  if (!/^[^/]+\/[^/]+$/.test(nameWithOwner)) {
    throw new Error(`Invalid repo id: "${nameWithOwner}"`);
  }
  return nameWithOwner as RepoId;
}

export function toPrNumber(number: number): PrNumber {
  return number as PrNumber;
}

export type CiStatus =
  | { state: "success" }
  | { state: "failure"; failedChecks: string[] }
  | { state: "pending" }
  | { state: "none" };

export type ReviewState =
  | { state: "reviewRequested" }
  | { state: "approved" }
  | { state: "changesRequested" }
  | { state: "none" };

export type Author =
  | { kind: "human"; login: string }
  | { kind: "agent"; agent: "claude" | "codex"; login: string };

/**
 * Derives Author from a login. A login ending in "[bot]" or containing
 * "claude"/"codex" (case-insensitive) is treated as an agent; the specific
 * agent is "codex" when the login mentions codex, "claude" otherwise.
 * ponytail: this app only distinguishes claude/codex agents from humans,
 * other bots (dependabot, etc.) fall in the "claude" bucket by default.
 */
export function deriveAuthor(login: string): Author {
  const lower = login.toLowerCase();
  const isAgent =
    lower.endsWith("[bot]") ||
    lower.includes("claude") ||
    lower.includes("codex");
  if (!isAgent) {
    return { kind: "human", login };
  }
  return {
    kind: "agent",
    agent: lower.includes("codex") ? "codex" : "claude",
    login,
  };
}

/**
 * Eén geaggregeerde reviewrun van een agent op deze PR: "commentsOnly" als
 * de agent alleen reviewde/reageerde, "commentsAndFixes" zodra diezelfde
 * agent ook commits pushte op de head-branch.
 */
export interface AgentReview {
  agent: "claude" | "codex";
  mode: "commentsOnly" | "commentsAndFixes";
  commentCount: number;
  commitCount: number;
  submittedAt: string;
}

export type Mergeable = "MERGEABLE" | "CONFLICTING" | "UNKNOWN";

export type ReviewerState = "approved" | "changesRequested" | "pending";

export interface Reviewer {
  login: string;
  state: ReviewerState;
}

export interface PullRequest {
  id: string;
  repoId: RepoId;
  number: PrNumber;
  title: string;
  url: string;
  headRef: string;
  baseRef: string;
  author: Author;
  ciStatus: CiStatus;
  reviewState: ReviewState;
  isDraft: boolean;
  mergeable: Mergeable;
  priority: 1 | 2 | null;
  createdAt: string;
  updatedAt: string;
  additions: number;
  deletions: number;
  comments: number;
  reviewers: Reviewer[];
  agentReviews: AgentReview[];
  assignees: string[];
  reviewRequestedFromMe: boolean;
  assignedToMe: boolean;
  authoredByMe: boolean;
}
