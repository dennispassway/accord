import { describe, expect, it } from "vitest";
import { NORMAL_GATE } from "../risk";
import type { PullRequest } from "./domain";
import { toPrNumber, toRepoId } from "./domain";
import { assertCanMerge, mergePullRequest, mergeReasons } from "./merge";
import { AuthError, GithubApiError } from "./queries";
import type { PrStackInfo } from "./stacks";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "PR_kwABC",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(42),
    title: "Add feature",
    url: "https://github.com/acme/widgets/pull/42",
    headRef: "feature/x",
    baseRef: "main",
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "success" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 3,
    deletions: 1,
    comments: 0,
    openThreads: 0,
    reviewers: [],
    agentReviewRounds: 0,
    agentReviews: [],
    agentCommitCount: 0,
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: true,
    headOid: "",
    changedPaths: [],
    changedFileCount: 0,
    humanApprovedHead: false,
    ...overrides,
  };
}

function stackInfo(overrides: Partial<PrStackInfo> = {}): PrStackInfo {
  return {
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(42),
    stackPosition: 1,
    stackSize: 1,
    blockedByPrNumbers: [],
    ...overrides,
  };
}

function reasonsOf(p: PullRequest, info: PrStackInfo | undefined) {
  return mergeReasons(p, info, NORMAL_GATE);
}

describe("mergeReasons", () => {
  it("is empty when the PR is clean and mergeable", () => {
    expect(reasonsOf(pr(), stackInfo())).toEqual([]);
  });

  it("flags red CI", () => {
    expect(
      reasonsOf(
        pr({ ciStatus: { state: "failure", failedChecks: ["build"] } }),
        stackInfo(),
      ),
    ).toContain("CI is rood");
  });

  it("flags checks GitHub did not start for budget, not as red CI", () => {
    const reasons = reasonsOf(
      pr({ ciStatus: { state: "billingBlocked" } }),
      stackInfo(),
    );
    expect(reasons).toContain("checks niet gestart: budget op");
    expect(reasons).not.toContain("CI is rood");
  });

  it("flags merge conflicts", () => {
    expect(reasonsOf(pr({ mergeable: "CONFLICTING" }), stackInfo())).toContain(
      "merge-conflicten",
    );
  });

  it("flags unknown mergeability", () => {
    expect(reasonsOf(pr({ mergeable: "UNKNOWN" }), stackInfo())).toContain(
      "mergebaarheid onbekend",
    );
  });

  it("flags CI still running", () => {
    expect(
      reasonsOf(pr({ ciStatus: { state: "pending" } }), stackInfo()),
    ).toContain("CI draait nog");
  });

  it("flags a draft PR", () => {
    expect(reasonsOf(pr({ isDraft: true }), stackInfo())).toContain("draft");
  });

  it("flags changes requested", () => {
    expect(
      reasonsOf(
        pr({ reviewState: { state: "changesRequested" } }),
        stackInfo(),
      ),
    ).toContain("changes requested");
  });

  it("flags a PR blocked by earlier PRs in the stack", () => {
    expect(
      reasonsOf(
        pr(),
        stackInfo({ blockedByPrNumbers: [toPrNumber(40), toPrNumber(41)] }),
      ),
    ).toContain("eerst #40, #41 mergen");
  });

  it("flags a missing required approval", () => {
    expect(
      reasonsOf(pr({ reviewState: { state: "reviewRequested" } }), stackInfo()),
    ).toEqual(["goedkeuring ontbreekt"]);
  });

  it("flags a branch that is behind its base", () => {
    expect(reasonsOf(pr({ mergeStateStatus: "BEHIND" }), stackInfo())).toEqual([
      "branch loopt achter op main",
    ]);
  });

  it("flags branch protection when nothing else explains BLOCKED", () => {
    expect(reasonsOf(pr({ mergeStateStatus: "BLOCKED" }), stackInfo())).toEqual(
      ["geblokkeerd door branch protection"],
    );
  });

  it("does not add branch protection when a missing approval explains BLOCKED", () => {
    expect(
      reasonsOf(
        pr({
          mergeStateStatus: "BLOCKED",
          reviewState: { state: "reviewRequested" },
        }),
        stackInfo(),
      ),
    ).toEqual(["goedkeuring ontbreekt"]);
  });

  it("does not add branch protection when unstarted checks explain BLOCKED", () => {
    expect(
      reasonsOf(
        pr({
          mergeStateStatus: "BLOCKED",
          ciStatus: { state: "billingBlocked" },
        }),
        stackInfo(),
      ),
    ).toEqual(["checks niet gestart: budget op"]);
  });

  it("does not add branch protection when CI explains BLOCKED", () => {
    expect(
      reasonsOf(
        pr({ mergeStateStatus: "BLOCKED", ciStatus: { state: "pending" } }),
        stackInfo(),
      ),
    ).toEqual(["CI draait nog"]);
    expect(
      reasonsOf(
        pr({
          mergeStateStatus: "BLOCKED",
          ciStatus: { state: "failure", failedChecks: ["build"] },
        }),
        stackInfo(),
      ),
    ).toEqual(["CI is rood"]);
  });

  it("does not add branch protection when changes requested explains BLOCKED", () => {
    expect(
      reasonsOf(
        pr({
          mergeStateStatus: "BLOCKED",
          reviewState: { state: "changesRequested" },
        }),
        stackInfo(),
      ),
    ).toEqual(["changes requested"]);
  });

  it("does not add branch protection when merge conflicts explain BLOCKED", () => {
    expect(
      reasonsOf(
        pr({ mergeStateStatus: "BLOCKED", mergeable: "CONFLICTING" }),
        stackInfo(),
      ),
    ).toEqual(["merge-conflicten"]);
  });

  it("returns multiple reasons at once", () => {
    expect(
      reasonsOf(pr({ isDraft: true, mergeable: "CONFLICTING" }), stackInfo()),
    ).toEqual(["merge-conflicten", "draft"]);
  });
});

type Call = { url: string; body: { query: string; variables: unknown } };

function fakeFetch(response: Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return response;
  };
  return { fetchImpl, calls };
}

function json(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("mergePullRequest", () => {
  it("sends the mergePullRequest mutation with the PR node id and method", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { mergePullRequest: { pullRequest: { id: "PR_kwABC" } } },
      }),
    );

    await mergePullRequest("token", "PR_kwABC", "SQUASH", "abc1234", fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.github.com/graphql");
    expect(calls[0]?.body.variables).toEqual({
      pullRequestId: "PR_kwABC",
      mergeMethod: "SQUASH",
      expectedHeadOid: "abc1234",
    });
    expect(calls[0]?.body.query).toContain("mergePullRequest");
    expect(calls[0]?.body.query).toContain("expectedHeadOid");
  });

  it("leaves expectedHeadOid out when the head sha is unknown", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { mergePullRequest: { pullRequest: { id: "PR_kwABC" } } },
      }),
    );

    await mergePullRequest("token", "PR_kwABC", "MERGE", "", fetchImpl);

    expect(calls[0]?.body.variables).toEqual({
      pullRequestId: "PR_kwABC",
      mergeMethod: "MERGE",
    });
  });

  it("throws AuthError on a 401", async () => {
    const { fetchImpl } = fakeFetch(json(401, {}));

    await expect(
      mergePullRequest("token", "PR_kwABC", "MERGE", "", fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("throws GithubApiError with the server message on a GraphQL error", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, { errors: [{ message: "Pull request is not mergeable" }] }),
    );

    const call = mergePullRequest("token", "PR_kwABC", "MERGE", "", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/not mergeable/);
  });

  it("throws GithubApiError with the server message on a non-ok, non-401 response", async () => {
    const { fetchImpl } = fakeFetch(
      json(500, { message: "Something went wrong" }),
    );

    const call = mergePullRequest("token", "PR_kwABC", "MERGE", "", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Something went wrong/);
  });

  it("mentions a possible rate limit and the retry-after header on a 403", async () => {
    const { fetchImpl } = fakeFetch(
      json(
        403,
        { message: "API rate limit exceeded" },
        { "retry-after": "30" },
      ),
    );

    const call = mergePullRequest("token", "PR_kwABC", "MERGE", "", fetchImpl);
    await expect(call).rejects.toThrow(/rate limit/);
    await expect(call).rejects.toThrow(/retry-after: 30s/);
  });
});

describe("assertCanMerge", () => {
  it("lets a clean PR through", () => {
    expect(() => assertCanMerge(pr(), stackInfo(), NORMAL_GATE)).not.toThrow();
  });

  it("throws with the reasons for a blocked PR", () => {
    const gate = {
      tier: "hoog" as const,
      reasons: ["a"],
      needsHumanReview: true,
    };
    expect(() => assertCanMerge(pr(), stackInfo(), gate)).toThrow(
      /menselijke review nodig/,
    );
    expect(() =>
      assertCanMerge(pr({ isDraft: true }), stackInfo(), NORMAL_GATE),
    ).toThrow(/draft/);
  });
});
