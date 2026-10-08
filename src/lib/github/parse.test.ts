import { describe, expect, it } from "vitest";
import type { MergeStateStatus } from "./domain";
import {
  draftPrNodeNoCi,
  prNodeWithAgentFixes,
  validPrNode,
} from "./fixtures/search-response";
import {
  isSearchTruncated,
  mergePrSources,
  parseSearchResponse,
} from "./parse";

describe("parseSearchResponse", () => {
  it("parses a valid node into a PullRequest", () => {
    const [pr] = parseSearchResponse({ nodes: [validPrNode] });

    expect(pr).toMatchObject({
      id: "PR_1",
      repoId: "acme/widgets",
      number: 42,
      title: "Add checkout flow",
      url: "https://github.com/acme/widgets/pull/42",
      headRef: "feature/checkout",
      baseRef: "main",
      author: { kind: "human", login: "dennis" },
      isDraft: false,
      mergeable: "MERGEABLE",
      mergeStateStatus: "BLOCKED",
      createdAt: "2026-07-01T09:00:00Z",
      updatedAt: "2026-07-02T09:00:00Z",
      additions: 120,
      deletions: 30,
      comments: 6,
      openThreads: 1,
      assignees: ["dennis"],
      reviewRequestedFromMe: false,
      assignedToMe: false,
      authoredByMe: false,
    });
    expect(pr?.ciStatus).toEqual({ state: "failure", failedChecks: ["build"] });
    expect(pr?.reviewState).toEqual({ state: "reviewRequested" });
    expect(pr?.reviewers).toEqual(
      expect.arrayContaining([
        { login: "alice", state: "pending" },
        { login: "bob", state: "approved" },
      ]),
    );
  });

  it("defaults ciStatus to none when absent", () => {
    const [pr] = parseSearchResponse({ nodes: [draftPrNodeNoCi] });

    expect(pr?.ciStatus).toEqual({ state: "none" });
    expect(pr?.reviewState).toEqual({ state: "none" });
    expect(pr?.isDraft).toBe(true);
  });

  it("skips nodes missing required fields instead of throwing", () => {
    const prs = parseSearchResponse({
      nodes: [
        { ...validPrNode, repository: { nameWithOwner: "" } },
        { ...validPrNode, title: null },
        undefined,
        null,
        "not an object",
      ],
    });

    expect(prs).toEqual([]);
  });

  it("returns an empty list for malformed top-level input", () => {
    expect(parseSearchResponse(null)).toEqual([]);
    expect(parseSearchResponse(undefined)).toEqual([]);
    expect(parseSearchResponse({})).toEqual([]);
  });
});

describe("parseSearchResponse - reviewers", () => {
  it("prefers an approved verdict over a pending request for the same login", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviewRequests: { nodes: [{ requestedReviewer: { login: "bob" } }] },
          latestOpinionatedReviews: {
            nodes: [{ author: { login: "bob" }, state: "APPROVED" }],
          },
        },
      ],
    });

    expect(pr?.reviewers).toEqual([{ login: "bob", state: "approved" }]);
  });

  it("maps CHANGES_REQUESTED and dedupes on login", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviewRequests: { nodes: [] },
          latestOpinionatedReviews: {
            nodes: [
              { author: { login: "bob" }, state: "CHANGES_REQUESTED" },
              { author: { login: "bob" }, state: "CHANGES_REQUESTED" },
            ],
          },
        },
      ],
    });

    expect(pr?.reviewers).toEqual([
      { login: "bob", state: "changesRequested" },
    ]);
  });

  it("returns an empty list when no reviewers are requested or reviewed", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviewRequests: { nodes: [] },
          latestOpinionatedReviews: { nodes: [] },
        },
      ],
    });

    expect(pr?.reviewers).toEqual([]);
  });

  it("counts issue comments plus review threads", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          comments: { totalCount: 3 },
          reviewThreads: { totalCount: 5 },
        },
      ],
    });

    expect(pr?.comments).toBe(8);
  });

  it("counts only unresolved review threads as open", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviewThreads: {
            totalCount: 3,
            nodes: [
              { isResolved: true },
              { isResolved: false },
              { isResolved: false },
            ],
          },
        },
      ],
    });

    expect(pr?.openThreads).toBe(2);
    expect(pr?.comments).toBe(7);
  });

  it("defaults openThreads to 0 when thread nodes are missing", () => {
    const [pr] = parseSearchResponse({
      nodes: [{ ...validPrNode, reviewThreads: { totalCount: 2 } }],
    });

    expect(pr?.openThreads).toBe(0);
  });

  it("parses every known mergeStateStatus", () => {
    const all: Record<MergeStateStatus, true> = {
      BEHIND: true,
      BLOCKED: true,
      CLEAN: true,
      DIRTY: true,
      DRAFT: true,
      HAS_HOOKS: true,
      UNKNOWN: true,
      UNSTABLE: true,
    };
    for (const status of Object.keys(all)) {
      const [pr] = parseSearchResponse({
        nodes: [{ ...validPrNode, mergeStateStatus: status }],
      });
      expect(pr?.mergeStateStatus).toBe(status);
    }
  });

  it("falls back to UNKNOWN for a missing or unexpected mergeStateStatus", () => {
    const [missing, odd] = parseSearchResponse({
      nodes: [
        { ...validPrNode, mergeStateStatus: undefined },
        { ...validPrNode, id: "PR_9", mergeStateStatus: "SOMETHING_NEW" },
      ],
    });

    expect(missing?.mergeStateStatus).toBe("UNKNOWN");
    expect(odd?.mergeStateStatus).toBe("UNKNOWN");
  });
});

describe("parseSearchResponse - agentReviews", () => {
  it("marks a review from an agent login as commentsOnly without commits", () => {
    const [pr] = parseSearchResponse({ nodes: [validPrNode] });

    expect(pr?.agentReviews).toEqual([
      {
        agent: "claude",
        mode: "commentsOnly",
        commentCount: 4,
        commitCount: 0,
        submittedAt: "2026-07-02T08:00:00Z",
      },
    ]);
  });

  it("marks an agent as commentsAndFixes once it also pushed a commit", () => {
    const [pr] = parseSearchResponse({ nodes: [prNodeWithAgentFixes] });

    expect(pr?.agentReviews).toEqual([
      {
        agent: "codex",
        mode: "commentsAndFixes",
        commentCount: 2,
        commitCount: 1,
        submittedAt: "2026-07-02T08:00:00Z",
      },
    ]);
  });

  it("ignores reviews and commits from human authors", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviews: {
            nodes: [
              {
                author: { login: "bob" },
                submittedAt: "2026-07-02T08:00:00Z",
                comments: { totalCount: 3 },
              },
            ],
          },
          agentCommits: { nodes: [] },
        },
      ],
    });

    expect(pr?.agentReviews).toEqual([]);
  });

  it("defaults to an empty list when reviews/commits are absent", () => {
    const [pr] = parseSearchResponse({
      nodes: [{ ...validPrNode, reviews: undefined, agentCommits: undefined }],
    });

    expect(pr?.agentReviews).toEqual([]);
  });

  it("herkent een agent-review via de verborgen marker, ook onder een menselijke login", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviews: {
            nodes: [
              {
                author: { login: "dennis" },
                submittedAt: "2026-07-02T08:00:00Z",
                comments: { totalCount: 3 },
                body: "<!-- accord:codex:withFixes -->\nZiet er goed uit.",
              },
            ],
          },
          agentCommits: { nodes: [] },
        },
      ],
    });

    expect(pr?.agentReviews).toEqual([
      {
        agent: "codex",
        mode: "commentsAndFixes",
        commentCount: 3,
        commitCount: 0,
        submittedAt: "2026-07-02T08:00:00Z",
      },
    ]);
  });

  describe("verdict in de marker", () => {
    function prWithReviews(
      reviews: { submittedAt: string; body: string; login?: string }[],
    ) {
      const [pr] = parseSearchResponse({
        nodes: [
          {
            ...validPrNode,
            reviews: {
              nodes: reviews.map((review) => ({
                author: { login: review.login ?? "dennis" },
                submittedAt: review.submittedAt,
                comments: { totalCount: 1 },
                body: review.body,
              })),
            },
            agentCommits: { nodes: [] },
          },
        ],
      });
      return pr;
    }

    it("leest fixes en verificatie uit het nieuwe formaat", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly fixes=nodig verificatie=lokaal -->\nTekst",
        },
      ]);

      expect(pr?.agentReviews[0]?.verdict).toEqual({
        fixes: "nodig",
        verificatie: "lokaal",
      });
      expect(pr?.agentReviews[0]?.mode).toBe("commentsOnly");
    });

    it("geeft geen verdict voor het oude formaat", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly -->\nTekst",
        },
      ]);

      expect(pr?.agentReviews[0]?.agent).toBe("claude");
      expect(pr?.agentReviews[0]?.verdict).toBeUndefined();
    });

    it("geeft geen verdict bij ongeldige waarden, maar herkent de agent wel", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:codex:commentsOnly fixes=misschien verificatie=ci -->",
        },
      ]);

      expect(pr?.agentReviews[0]?.agent).toBe("codex");
      expect(pr?.agentReviews[0]?.verdict).toBeUndefined();
    });

    it.each([
      "<!-- accord:claude:commentsOnly fixes=<nodig|geen> verificatie=<ci|lokaal> -->",
      '<!-- accord:claude:commentsOnly fixes="nodig" verificatie="ci" -->',
      "<!-- accord:claude:commentsOnly fixes=nodig,verificatie=ci -->",
    ])(
      "herkent een marker met rommelige attributen als agent-review: %s",
      (body) => {
        const pr = prWithReviews([
          { submittedAt: "2026-07-02T08:00:00Z", body },
        ]);

        expect(pr?.agentReviews[0]?.agent).toBe("claude");
        expect(pr?.agentReviews[0]?.verdict).toBeUndefined();
      },
    );

    it("herkent geen agent als de naam direct doorloopt (accord:claudefoo)", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:claudefoo -->",
        },
      ]);

      expect(pr?.agentReviews).toEqual([]);
    });

    it("geeft geen verdict als een van de twee velden ontbreekt", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly fixes=geen -->",
        },
      ]);

      expect(pr?.agentReviews[0]?.verdict).toBeUndefined();
    });

    it("gebruikt het verdict van de meest recente review, ongeacht volgorde", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-03T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly fixes=geen verificatie=ci -->",
        },
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly fixes=nodig verificatie=lokaal -->",
        },
      ]);

      expect(pr?.agentReviews).toHaveLength(1);
      expect(pr?.agentReviews[0]?.verdict).toEqual({
        fixes: "geen",
        verificatie: "ci",
      });
    });

    it("laat een nieuwere review zonder verdict het oude verdict vervangen", () => {
      const pr = prWithReviews([
        {
          submittedAt: "2026-07-02T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly fixes=nodig verificatie=ci -->",
        },
        {
          submittedAt: "2026-07-03T08:00:00Z",
          body: "<!-- accord:claude:commentsOnly -->",
        },
      ]);

      expect(pr?.agentReviews[0]?.verdict).toBeUndefined();
    });
  });

  it("laat een body zonder marker onder een menselijke login ongewijzigd", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          reviews: {
            nodes: [
              {
                author: { login: "dennis" },
                submittedAt: "2026-07-02T08:00:00Z",
                comments: { totalCount: 3 },
                body: "Ziet er goed uit, geen marker hier.",
              },
            ],
          },
          agentCommits: { nodes: [] },
        },
      ],
    });

    expect(pr?.agentReviews).toEqual([]);
  });
});

describe("mergePrSources", () => {
  it("dedupes by repoId+number and sets flags per source", () => {
    const [pr] = parseSearchResponse({ nodes: [validPrNode] });
    if (!pr) throw new Error("fixture should parse");

    const merged = mergePrSources(
      { source: "reviewRequested", prs: [pr] },
      { source: "assigned", prs: [pr] },
      { source: "authored", prs: [] },
    );

    expect(merged).toHaveLength(1);
    expect(merged[0]).toMatchObject({
      reviewRequestedFromMe: true,
      assignedToMe: true,
      authoredByMe: false,
    });
  });
});

describe("isSearchTruncated", () => {
  it("is true als issueCount groter is dan het aantal teruggegeven nodes", () => {
    expect(isSearchTruncated({ issueCount: 120, nodes: [validPrNode] })).toBe(
      true,
    );
  });

  it("is false als issueCount gelijk is aan het aantal nodes", () => {
    expect(isSearchTruncated({ issueCount: 1, nodes: [validPrNode] })).toBe(
      false,
    );
  });

  it("is false als issueCount ontbreekt (oude fixtures)", () => {
    expect(isSearchTruncated({ nodes: [validPrNode] })).toBe(false);
  });
});
