import { describe, expect, it } from "vitest";
import type { PullRequest } from "./domain";
import { toPrNumber, toRepoId } from "./domain";
import { mergePullRequest, mergeReasons } from "./merge";
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
    priority: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 3,
    deletions: 1,
    comments: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: true,
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

describe("mergeReasons", () => {
  it("is empty when the PR is clean and mergeable", () => {
    expect(mergeReasons(pr(), stackInfo())).toEqual([]);
  });

  it("flags red CI", () => {
    expect(
      mergeReasons(
        pr({ ciStatus: { state: "failure", failedChecks: ["build"] } }),
        stackInfo(),
      ),
    ).toContain("CI is rood");
  });

  it("flags merge conflicts", () => {
    expect(
      mergeReasons(pr({ mergeable: "CONFLICTING" }), stackInfo()),
    ).toContain("merge-conflicten");
  });

  it("flags unknown mergeability", () => {
    expect(mergeReasons(pr({ mergeable: "UNKNOWN" }), stackInfo())).toContain(
      "mergebaarheid onbekend",
    );
  });

  it("flags CI still running", () => {
    expect(
      mergeReasons(pr({ ciStatus: { state: "pending" } }), stackInfo()),
    ).toContain("CI draait nog");
  });

  it("flags a draft PR", () => {
    expect(mergeReasons(pr({ isDraft: true }), stackInfo())).toContain("draft");
  });

  it("flags changes requested", () => {
    expect(
      mergeReasons(
        pr({ reviewState: { state: "changesRequested" } }),
        stackInfo(),
      ),
    ).toContain("changes requested");
  });

  it("flags a PR blocked by earlier PRs in the stack", () => {
    expect(
      mergeReasons(
        pr(),
        stackInfo({ blockedByPrNumbers: [toPrNumber(40), toPrNumber(41)] }),
      ),
    ).toContain("eerst #40, #41 mergen");
  });

  it("returns multiple reasons at once", () => {
    expect(
      mergeReasons(
        pr({ isDraft: true, mergeable: "CONFLICTING" }),
        stackInfo(),
      ),
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

    await mergePullRequest("token", "PR_kwABC", "SQUASH", fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.github.com/graphql");
    expect(calls[0]?.body.variables).toEqual({
      pullRequestId: "PR_kwABC",
      mergeMethod: "SQUASH",
    });
    expect(calls[0]?.body.query).toContain("mergePullRequest");
  });

  it("throws AuthError on a 401", async () => {
    const { fetchImpl } = fakeFetch(json(401, {}));

    await expect(
      mergePullRequest("token", "PR_kwABC", "MERGE", fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("throws GithubApiError with the server message on a GraphQL error", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, { errors: [{ message: "Pull request is not mergeable" }] }),
    );

    const call = mergePullRequest("token", "PR_kwABC", "MERGE", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/not mergeable/);
  });

  it("throws GithubApiError with the server message on a non-ok, non-401 response", async () => {
    const { fetchImpl } = fakeFetch(
      json(500, { message: "Something went wrong" }),
    );

    const call = mergePullRequest("token", "PR_kwABC", "MERGE", fetchImpl);
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

    const call = mergePullRequest("token", "PR_kwABC", "MERGE", fetchImpl);
    await expect(call).rejects.toThrow(/rate limit/);
    await expect(call).rejects.toThrow(/retry-after: 30s/);
  });
});
