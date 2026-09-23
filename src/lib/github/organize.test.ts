import { describe, expect, it } from "vitest";
import type { PullRequest } from "./domain";
import { toPrNumber, toRepoId } from "./domain";
import { groupByRepo } from "./organize";

function pr(
  overrides: Partial<Omit<PullRequest, "number" | "repoId">> & {
    number: number;
    repoId: string;
  },
): PullRequest {
  return {
    id: `id-${overrides.repoId}-${overrides.number}`,
    title: `PR ${overrides.number}`,
    url: `https://github.com/${overrides.repoId}/pull/${overrides.number}`,
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "none" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 0,
    deletions: 0,
    comments: 0,
    openThreads: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    headRef: `head-${overrides.number}`,
    baseRef: "main",
    ...overrides,
    repoId: toRepoId(overrides.repoId),
    number: toPrNumber(overrides.number),
  };
}

describe("groupByRepo", () => {
  it("groups PRs by repo, sorted by repo name", () => {
    const prs = [
      pr({ number: 1, repoId: "acme/zeta" }),
      pr({ number: 2, repoId: "acme/alpha" }),
    ];

    const groups = groupByRepo(prs);

    expect(groups.map((g) => g.repoId)).toEqual(["acme/alpha", "acme/zeta"]);
  });

  it("sorts a stack base before its children", () => {
    const prs = [
      pr({
        number: 2,
        repoId: "acme/widgets",
        baseRef: "head-1",
        headRef: "head-2",
      }),
      pr({
        number: 1,
        repoId: "acme/widgets",
        baseRef: "main",
        headRef: "head-1",
      }),
    ];

    const [group] = groupByRepo(prs);

    expect(group?.prs.map((p) => p.number)).toEqual([
      toPrNumber(1),
      toPrNumber(2),
    ]);
  });

  it("puts red CI authored-by-me PRs before others at the same stack level, then oldest review request first", () => {
    const prs = [
      pr({
        number: 1,
        repoId: "acme/widgets",
        createdAt: "2026-07-01T09:00:00Z",
        ciStatus: { state: "success" },
      }),
      pr({
        number: 2,
        repoId: "acme/widgets",
        createdAt: "2026-07-03T09:00:00Z",
        authoredByMe: true,
        ciStatus: { state: "failure", failedChecks: ["build"] },
      }),
      pr({
        number: 3,
        repoId: "acme/widgets",
        createdAt: "2026-07-02T09:00:00Z",
        ciStatus: { state: "success" },
      }),
    ];

    const [group] = groupByRepo(prs);

    expect(group?.prs.map((p) => p.number)).toEqual([
      toPrNumber(2),
      toPrNumber(1),
      toPrNumber(3),
    ]);
  });
});
