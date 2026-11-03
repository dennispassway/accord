import type { RiskGate } from "../risk";
import type { CiStatus, PullRequest } from "./domain";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";
import type { PrStackInfo } from "./stacks";

export type MergeMethod = "MERGE" | "SQUASH";

const MERGE_PR_MUTATION = `
mutation MergePr($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!, $expectedHeadOid: GitObjectID) {
  mergePullRequest(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod, expectedHeadOid: $expectedHeadOid }) {
    pullRequest { id }
  }
}
`;

/** Waarom de CI mergen tegenhoudt; null als hij dat niet doet. */
const CI_MERGE_REASON: Record<CiStatus["state"], string | null> = {
  success: null,
  none: null,
  failure: "CI is rood",
  billingBlocked: "checks niet gestart: budget op",
  pending: "CI draait nog",
};

/**
 * BLOCKED is GitHubs verzamelwoord; alleen melden als geen andere reden de
 * blokkade al verklaart.
 */
export function isBlockedByProtection(pr: PullRequest): boolean {
  return (
    pr.mergeStateStatus === "BLOCKED" &&
    pr.reviewState.state !== "reviewRequested" &&
    pr.reviewState.state !== "changesRequested" &&
    CI_MERGE_REASON[pr.ciStatus.state] == null &&
    pr.mergeable !== "CONFLICTING"
  );
}

/**
 * Pure check: reasons mergen nu niet mag. Lege array betekent mergen mag.
 */
export function mergeReasons(
  pr: PullRequest,
  stackInfo: PrStackInfo | undefined,
  risk: RiskGate,
): string[] {
  const reasons: string[] = [];
  if (pr.mergeable === "CONFLICTING") reasons.push("merge-conflicten");
  if (pr.mergeable === "UNKNOWN") reasons.push("mergebaarheid onbekend");
  if (pr.isDraft) reasons.push("draft");
  const ciReason = CI_MERGE_REASON[pr.ciStatus.state];
  if (ciReason != null) reasons.push(ciReason);
  if (pr.reviewState.state === "changesRequested") {
    reasons.push("changes requested");
  }
  if (pr.reviewState.state === "reviewRequested") {
    reasons.push("goedkeuring ontbreekt");
  }
  if (pr.mergeStateStatus === "BEHIND") {
    reasons.push(`branch loopt achter op ${pr.baseRef}`);
  }
  if (isBlockedByProtection(pr)) {
    reasons.push("geblokkeerd door branch protection");
  }
  if (stackInfo && stackInfo.blockedByPrNumbers.length > 0) {
    reasons.push(
      `eerst ${stackInfo.blockedByPrNumbers.map((n) => `#${n}`).join(", ")} mergen`,
    );
  }
  if (risk.needsHumanReview) {
    reasons.push("menselijke review nodig (hoog risico)");
  }
  return reasons;
}

/** Vangnet voor een merge die langs de UI-poort glipt (stale state, snelkoppeling). */
export function assertCanMerge(
  pr: PullRequest,
  stackInfo: PrStackInfo | undefined,
  risk: RiskGate,
): void {
  const reasons = mergeReasons(pr, stackInfo, risk);
  if (reasons.length > 0) {
    throw new Error(`Mergen kan nu niet: ${reasons.join(", ")}`);
  }
}

/**
 * Merget een PR via de mergePullRequest GraphQL-mutatie. `expectedHeadOid` laat
 * GitHub weigeren als er na de risicocheck een commit bij is gekomen; "" (head
 * onbekend) laat hem weg.
 */
export async function mergePullRequest(
  token: string,
  prNodeId: string,
  method: MergeMethod,
  expectedHeadOid: string,
  fetchImpl: FetchImpl,
): Promise<void> {
  const response = await fetchImpl("https://api.github.com/graphql", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      query: MERGE_PR_MUTATION,
      variables: {
        pullRequestId: prNodeId,
        mergeMethod: method,
        ...(expectedHeadOid !== "" && { expectedHeadOid }),
      },
    }),
  });

  if (response.status === 401) {
    throw new AuthError();
  }
  if (!response.ok) {
    const detail = await responseErrorDetail(response);
    if (response.status === 403) {
      throw new GithubApiError(
        `Geen schrijfrechten om te mergen, of een GitHub rate limit${rateLimitNote(response)}: ${detail}`,
      );
    }
    throw new GithubApiError(
      `GitHub API responded with ${response.status}: ${detail}`,
    );
  }

  const json: unknown = await response.json();
  const body = json as { errors?: { message: string }[] };
  const errors =
    typeof json === "object" && json !== null ? body.errors : undefined;
  if (errors != null && errors.length > 0) {
    throw new GithubApiError(errors[0]?.message ?? "GitHub GraphQL error");
  }
}
