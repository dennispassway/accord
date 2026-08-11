import type { PullRequest } from "./domain";
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
mutation MergePr($pullRequestId: ID!, $mergeMethod: PullRequestMergeMethod!) {
  mergePullRequest(input: { pullRequestId: $pullRequestId, mergeMethod: $mergeMethod }) {
    pullRequest { id }
  }
}
`;

/**
 * Pure check: reasons mergen nu niet mag. Lege array betekent mergen mag.
 */
export function mergeReasons(
  pr: PullRequest,
  stackInfo: PrStackInfo | undefined,
): string[] {
  const reasons: string[] = [];
  if (pr.mergeable === "CONFLICTING") reasons.push("merge-conflicten");
  if (pr.mergeable === "UNKNOWN") reasons.push("mergebaarheid onbekend");
  if (pr.isDraft) reasons.push("draft");
  if (pr.ciStatus.state === "failure") reasons.push("CI is rood");
  if (pr.ciStatus.state === "pending") reasons.push("CI draait nog");
  if (pr.reviewState.state === "changesRequested") {
    reasons.push("changes requested");
  }
  if (stackInfo && stackInfo.blockedByPrNumbers.length > 0) {
    reasons.push(
      `eerst ${stackInfo.blockedByPrNumbers.map((n) => `#${n}`).join(", ")} mergen`,
    );
  }
  return reasons;
}

/** Merget een PR via de mergePullRequest GraphQL-mutatie. */
export async function mergePullRequest(
  token: string,
  prNodeId: string,
  method: MergeMethod,
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
      variables: { pullRequestId: prNodeId, mergeMethod: method },
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
