import { describe, expect, it } from "vitest";
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
      priority: 1,
      createdAt: "2026-07-01T09:00:00Z",
      updatedAt: "2026-07-02T09:00:00Z",
      additions: 120,
      deletions: 30,
      comments: 6,
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

  it("defaults ciStatus to none and priority to null when absent", () => {
    const [pr] = parseSearchResponse({ nodes: [draftPrNodeNoCi] });

    expect(pr?.ciStatus).toEqual({ state: "none" });
    expect(pr?.reviewState).toEqual({ state: "none" });
    expect(pr?.priority).toBeNull();
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
