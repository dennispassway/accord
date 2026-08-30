import { describe, expect, it } from "vitest";
import { branchesToResolve, planStackRebase } from "./autoRebase";
import type { PullRequest } from "./domain";
import { toPrNumber, toRepoId } from "./domain";

function pr(
  overrides: Partial<Omit<PullRequest, "number">> & {
    number: number;
    baseRef: string;
    headRef: string;
  },
): PullRequest {
  return {
    id: `id-${overrides.number}`,
    repoId: toRepoId("acme/octocat"),
    title: `PR ${overrides.number}`,
    url: `https://github.com/acme/octocat/pull/${overrides.number}`,
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

describe("planStackRebase", () => {
  it("plant niets als de gemergde PR geen stapel had", () => {
    const merged = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    expect(planStackRebase(merged, [merged])).toEqual([]);
  });

  it("plant een lineaire keten van 3, van onder naar boven", () => {
    const a = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    const b = pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" });
    const c = pr({ number: 3, baseRef: "feature/b", headRef: "feature/c" });

    const steps = planStackRebase(a, [a, b, c]);

    expect(steps).toEqual([
      {
        prNumber: toPrNumber(2),
        branch: "feature/b",
        parentBranch: "feature/a",
        newBase: "main",
      },
      {
        prNumber: toPrNumber(3),
        branch: "feature/c",
        parentBranch: "feature/b",
        newBase: "feature/b",
      },
    ]);
  });

  it("plant beide kinderen van een diamant op dezelfde base", () => {
    const a = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    const b = pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" });
    const c = pr({ number: 3, baseRef: "feature/a", headRef: "feature/c" });

    const steps = planStackRebase(a, [a, b, c]);

    expect(steps).toEqual(
      expect.arrayContaining([
        {
          prNumber: toPrNumber(2),
          branch: "feature/b",
          parentBranch: "feature/a",
          newBase: "main",
        },
        {
          prNumber: toPrNumber(3),
          branch: "feature/c",
          parentBranch: "feature/a",
          newBase: "main",
        },
      ]),
    );
    expect(steps).toHaveLength(2);
  });

  it("plant niets bij het mergen van een PR zonder kinderen erboven", () => {
    const a = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    const b = pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" });
    const c = pr({ number: 3, baseRef: "feature/b", headRef: "feature/c" });

    // c wordt gemerged, maar niets stapelt op c
    expect(planStackRebase(c, [a, b, c])).toEqual([]);
  });

  it("plant de kinderen boven een gemergde middelste PR", () => {
    const a = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    const b = pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" });
    const c = pr({ number: 3, baseRef: "feature/b", headRef: "feature/c" });

    const steps = planStackRebase(b, [a, b, c]);

    expect(steps).toEqual([
      {
        prNumber: toPrNumber(3),
        branch: "feature/c",
        parentBranch: "feature/b",
        newBase: "feature/a",
      },
    ]);
  });

  it("houdt andere repo's buiten beeld", () => {
    const a = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    const other = pr({
      number: 2,
      baseRef: "feature/a",
      headRef: "feature/b",
      repoId: toRepoId("acme/andere-repo"),
    });
    expect(planStackRebase(a, [a, other])).toEqual([]);
  });
});

describe("branchesToResolve", () => {
  it("is leeg als er niets te plannen valt", () => {
    expect(branchesToResolve([])).toEqual([]);
  });

  it("is de unie van alle branch- en parentBranch-namen", () => {
    const a = pr({ number: 1, baseRef: "main", headRef: "feature/a" });
    const b = pr({ number: 2, baseRef: "feature/a", headRef: "feature/b" });
    const c = pr({ number: 3, baseRef: "feature/b", headRef: "feature/c" });
    const steps = planStackRebase(a, [a, b, c]);

    expect(new Set(branchesToResolve(steps))).toEqual(
      new Set(["feature/a", "feature/b", "feature/c"]),
    );
  });
});
