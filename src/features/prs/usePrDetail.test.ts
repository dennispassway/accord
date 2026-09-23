import { describe, expect, it } from "vitest";
import { deriveAuthor } from "../../lib/github/domain";
import type { PrComment, PrDetail } from "../../lib/github/prDetail";
import {
  MOCK_PR_DETAIL_FALLBACK,
  MOCK_PR_DETAILS,
} from "../../lib/mock/detailFixtures";
import {
  applyReply,
  applyResolved,
  detailFromCache,
  mockDetailState,
  stateAfterFailedRefetch,
} from "./usePrDetail";

describe("mockDetailState", () => {
  it("geeft de fixture terug voor een bekende PR", () => {
    const known = "acme/knowledge-base#167";
    expect(mockDetailState(known, false)).toEqual({
      status: "ready",
      detail: MOCK_PR_DETAILS[known],
      error: null,
    });
  });

  it("valt terug op de fallback-fixture voor een onbekende PR", () => {
    expect(mockDetailState("onbekend/repo#1", false)).toEqual({
      status: "ready",
      detail: MOCK_PR_DETAIL_FALLBACK,
      error: null,
    });
  });

  it("het QA-foutpad wint altijd, ook op een bekende PR", () => {
    const result = mockDetailState("acme/knowledge-base#167", true);
    expect(result.status).toBe("error");
    expect(result.detail).toBeNull();
    expect(result.error).not.toBeNull();
  });
});

describe("detailFromCache", () => {
  it("geeft null als de prKey nog niet in de cache staat, geen tweede fetch nodig zonder deze check", () => {
    const cache = new Map<string, PrDetail>();
    expect(detailFromCache(cache, "acme/widgets#1")).toBeNull();
  });

  it("geeft een ready-state met de gecachte detail bij een cache-hit", () => {
    const cache = new Map<string, PrDetail>();
    cache.set("acme/widgets#1", MOCK_PR_DETAIL_FALLBACK);
    expect(detailFromCache(cache, "acme/widgets#1")).toEqual({
      status: "ready",
      detail: MOCK_PR_DETAIL_FALLBACK,
      error: null,
    });
  });
});

function detail(overrides: Partial<PrDetail> = {}): PrDetail {
  return {
    diff: "",
    diffTooLarge: false,
    issueComments: [],
    reviewThreads: [
      {
        id: "thread-1",
        path: "src/index.ts",
        line: 3,
        isResolved: false,
        viewerCanReply: true,
        viewerCanResolve: true,
        viewerCanUnresolve: false,
        comments: [],
      },
      {
        id: "thread-2",
        path: "src/other.ts",
        line: null,
        isResolved: true,
        viewerCanReply: false,
        viewerCanResolve: false,
        viewerCanUnresolve: true,
        comments: [],
      },
    ],
    ...overrides,
  };
}

describe("applyReply", () => {
  it("voegt de comment toe aan de thread met dat id", () => {
    const comment: PrComment = {
      author: deriveAuthor("octocat"),
      bodyText: "hoi",
      body: "hoi",
      createdAt: "2026-09-01T00:00:00Z",
    };

    const result = applyReply(detail(), "thread-1", comment);

    expect(result.reviewThreads[0]?.comments).toEqual([comment]);
    expect(result.reviewThreads[1]?.comments).toEqual([]);
  });

  it("laat de rest van de detail ongewijzigd", () => {
    const original = detail();
    const comment: PrComment = {
      author: deriveAuthor("octocat"),
      bodyText: "hoi",
      body: "hoi",
      createdAt: "2026-09-01T00:00:00Z",
    };

    const result = applyReply(original, "thread-1", comment);

    expect(result.diff).toBe(original.diff);
    expect(result.reviewThreads[0]?.id).toBe("thread-1");
  });
});

describe("applyResolved", () => {
  it("zet isResolved op true voor de aangewezen thread", () => {
    const result = applyResolved(detail(), "thread-1", true);
    expect(result.reviewThreads[0]?.isResolved).toBe(true);
    expect(result.reviewThreads[1]?.isResolved).toBe(true);
  });

  it("zet isResolved op false (heropenen)", () => {
    const result = applyResolved(detail(), "thread-2", false);
    expect(result.reviewThreads[1]?.isResolved).toBe(false);
    expect(result.reviewThreads[0]?.isResolved).toBe(false);
  });

  it("laat andere threads ongemoeid", () => {
    const result = applyResolved(detail(), "thread-1", true);
    expect(result.reviewThreads[1]).toEqual(detail().reviewThreads[1]);
  });

  it("zet viewerCanResolve/viewerCanUnresolve om bij resolven", () => {
    const result = applyResolved(detail(), "thread-1", true);
    expect(result.reviewThreads[0]?.viewerCanResolve).toBe(false);
    expect(result.reviewThreads[0]?.viewerCanUnresolve).toBe(true);
  });

  it("zet viewerCanResolve/viewerCanUnresolve om bij heropenen", () => {
    const result = applyResolved(detail(), "thread-2", false);
    expect(result.reviewThreads[1]?.viewerCanResolve).toBe(true);
    expect(result.reviewThreads[1]?.viewerCanUnresolve).toBe(false);
  });
});

describe("stateAfterFailedRefetch", () => {
  it("past de lokale wijziging toe en meldt geen fout", () => {
    const result = stateAfterFailedRefetch(detail(), (d) =>
      applyResolved(d, "thread-1", true),
    );
    expect(result).toEqual({
      status: "ready",
      detail: applyResolved(detail(), "thread-1", true),
      error: null,
    });
  });

  it("geeft null als er nog geen detail is om lokaal bij te werken", () => {
    expect(stateAfterFailedRefetch(null, (d) => d)).toBeNull();
  });
});
