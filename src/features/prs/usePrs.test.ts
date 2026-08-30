import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import type { PrsState } from "./usePrs";
import {
  createRecentlyMergedTracker,
  detectCiFlippedToRed,
  nextStateOnLoadError,
  shouldRefreshOnVisible,
} from "./usePrs";

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

describe("nextStateOnLoadError", () => {
  it("bij een ready-state met data blijft de lijst staan en wordt refreshError gezet", () => {
    const ready: PrsState = {
      status: "ready",
      prs: [],
      lastUpdated: new Date("2026-08-02T10:00:00Z"),
      writeError: null,
      refreshError: null,
      viewerLogin: "dennis",
      truncated: false,
    };
    const next = nextStateOnLoadError(ready, "Netwerkfout");
    expect(next).toEqual({ ...ready, refreshError: "Netwerkfout" });
  });

  it("bij de allereerste load (geen data) wordt het volledige foutscherm getoond", () => {
    const loading: PrsState = { status: "loading" };
    expect(nextStateOnLoadError(loading, "Netwerkfout")).toEqual({
      status: "error",
      message: "Netwerkfout",
    });
  });
});

describe("shouldRefreshOnVisible", () => {
  it("staat een refresh toe als de laatste minstens 30s geleden was", () => {
    expect(shouldRefreshOnVisible(0, 30_000)).toBe(true);
    expect(shouldRefreshOnVisible(0, 31_000)).toBe(true);
  });

  it("blokkeert een refresh binnen 30s na de vorige", () => {
    expect(shouldRefreshOnVisible(0, 29_999)).toBe(false);
    expect(shouldRefreshOnVisible(1000, 1000)).toBe(false);
  });
});

describe("createRecentlyMergedTracker (B2)", () => {
  it("filtert een net gemergede PR uit een fetch-uitkomst", () => {
    const tracker = createRecentlyMergedTracker();
    const merged = pr({ id: "PR_merged" });
    const other = pr({ id: "PR_other" });

    tracker.mark(merged.id, 0);

    expect(tracker.filter([merged, other], 1_000)).toEqual([other]);
  });

  it("laat de PR weer door zodra de TTL verlopen is", () => {
    const tracker = createRecentlyMergedTracker(10 * 60 * 1000);
    const merged = pr({ id: "PR_merged" });

    tracker.mark(merged.id, 0);

    expect(tracker.filter([merged], 10 * 60 * 1000 + 1)).toEqual([merged]);
  });

  it("laat lijsten zonder recent gemergede PR's ongemoeid", () => {
    const tracker = createRecentlyMergedTracker();
    const other = pr({ id: "PR_other" });

    expect(tracker.filter([other], 0)).toEqual([other]);
  });
});

describe("detectCiFlippedToRed", () => {
  it("geeft een eigen PR terug die van pending naar failure omslaat", () => {
    const before = pr({ id: "PR_1", ciStatus: { state: "pending" } });
    const after = pr({
      id: "PR_1",
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });

    expect(detectCiFlippedToRed([before], [after])).toEqual([after]);
  });

  it("geeft een eigen PR terug die van success naar failure omslaat", () => {
    const before = pr({ id: "PR_1", ciStatus: { state: "success" } });
    const after = pr({
      id: "PR_1",
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });

    expect(detectCiFlippedToRed([before], [after])).toEqual([after]);
  });

  it("negeert een PR die niet van de gebruiker zelf is", () => {
    const before = pr({
      id: "PR_1",
      authoredByMe: false,
      ciStatus: { state: "success" },
    });
    const after = pr({
      id: "PR_1",
      authoredByMe: false,
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });

    expect(detectCiFlippedToRed([before], [after])).toEqual([]);
  });

  it("negeert een PR die al rood was (geen omslag)", () => {
    const before = pr({
      id: "PR_1",
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });
    const after = pr({
      id: "PR_1",
      ciStatus: { state: "failure", failedChecks: ["build", "lint"] },
    });

    expect(detectCiFlippedToRed([before], [after])).toEqual([]);
  });

  it("negeert een nieuwe PR zonder vorige snapshot", () => {
    const after = pr({
      id: "PR_new",
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });

    expect(detectCiFlippedToRed([], [after])).toEqual([]);
  });
});
