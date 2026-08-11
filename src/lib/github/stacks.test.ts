import { describe, expect, it } from "vitest";
import type { PullRequest } from "./domain";
import { toPrNumber, toRepoId } from "./domain";
import { computeStackInfo } from "./stacks";

function pr(
  overrides: Partial<Omit<PullRequest, "number">> & {
    number: number;
    baseRef: string;
    headRef: string;
  },
): PullRequest {
  return {
    id: `id-${overrides.number}`,
    repoId: toRepoId("acme/widgets"),
    title: `PR ${overrides.number}`,
    url: `https://github.com/acme/widgets/pull/${overrides.number}`,
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "none" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    priority: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 0,
    deletions: 0,
    comments: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    ...overrides,
    number: toPrNumber(overrides.number),
  };
}

function infoFor(infos: ReturnType<typeof computeStackInfo>, number: number) {
  return infos.find((info) => info.number === toPrNumber(number));
}

describe("computeStackInfo", () => {
  it("treats a PR based on the default branch as unstacked", () => {
    const prs = [pr({ number: 1, baseRef: "main", headRef: "feature/a" })];

    const infos = computeStackInfo(prs);

    expect(infoFor(infos, 1)).toMatchObject({
      stackPosition: 1,
      stackSize: 1,
      blockedByPrNumbers: [],
    });
  });

  it("builds a chain of 3+ PRs, base first", () => {
    const prs = [
      pr({ number: 1, baseRef: "main", headRef: "feature/a" }),
      pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" }),
      pr({ number: 3, baseRef: "feature/b", headRef: "feature/c" }),
    ];

    const infos = computeStackInfo(prs);

    expect(infoFor(infos, 1)).toMatchObject({
      stackPosition: 1,
      stackSize: 3,
      blockedByPrNumbers: [],
    });
    expect(infoFor(infos, 2)).toMatchObject({
      stackPosition: 2,
      stackSize: 3,
      blockedByPrNumbers: [toPrNumber(1)],
    });
    expect(infoFor(infos, 3)).toMatchObject({
      stackPosition: 3,
      stackSize: 3,
      blockedByPrNumbers: [toPrNumber(1), toPrNumber(2)],
    });
  });

  it("does not chain two siblings based on the same PR", () => {
    const prs = [
      pr({ number: 1, baseRef: "main", headRef: "feature/a" }),
      pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" }),
      pr({ number: 3, baseRef: "feature/a", headRef: "feature/c" }),
    ];

    const infos = computeStackInfo(prs);

    expect(infoFor(infos, 2)).toMatchObject({
      stackPosition: 2,
      blockedByPrNumbers: [toPrNumber(1)],
    });
    expect(infoFor(infos, 3)).toMatchObject({
      stackPosition: 2,
      blockedByPrNumbers: [toPrNumber(1)],
    });
  });

  it("treats a cycle as standalone PRs instead of crashing", () => {
    const prs = [
      pr({ number: 1, baseRef: "feature/b", headRef: "feature/a" }),
      pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" }),
    ];

    expect(() => computeStackInfo(prs)).not.toThrow();
    const infos = computeStackInfo(prs);
    expect(infoFor(infos, 1)).toMatchObject({
      stackPosition: 1,
      stackSize: 1,
      blockedByPrNumbers: [],
    });
    expect(infoFor(infos, 2)).toMatchObject({
      stackPosition: 1,
      stackSize: 1,
      blockedByPrNumbers: [],
    });
  });
});
