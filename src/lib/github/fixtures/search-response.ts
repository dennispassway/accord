/** Realistic GraphQL search-result fixtures, for tests only. */

export const validPrNode = {
  id: "PR_1",
  repository: { nameWithOwner: "acme/widgets" },
  number: 42,
  title: "Add checkout flow",
  url: "https://github.com/acme/widgets/pull/42",
  headRefName: "feature/checkout",
  baseRefName: "main",
  author: { login: "dennis" },
  labels: { nodes: [{ name: "P1" }] },
  isDraft: false,
  mergeable: "MERGEABLE",
  reviewDecision: "REVIEW_REQUIRED",
  additions: 120,
  deletions: 30,
  createdAt: "2026-07-01T09:00:00Z",
  updatedAt: "2026-07-02T09:00:00Z",
  comments: { totalCount: 4 },
  reviewThreads: { totalCount: 2 },
  assignees: { nodes: [{ login: "dennis" }] },
  reviewRequests: {
    nodes: [{ requestedReviewer: { login: "alice" } }],
  },
  latestOpinionatedReviews: {
    nodes: [{ author: { login: "bob" }, state: "APPROVED" }],
  },
  reviews: {
    nodes: [
      {
        author: { login: "claude" },
        submittedAt: "2026-07-02T08:00:00Z",
        comments: { totalCount: 4 },
      },
    ],
  },
  agentCommits: { nodes: [] },
  commits: {
    nodes: [
      {
        commit: {
          statusCheckRollup: {
            state: "FAILURE",
            contexts: {
              nodes: [
                { name: "build", conclusion: "FAILURE" },
                { context: "lint", state: "SUCCESS" },
              ],
            },
          },
        },
      },
    ],
  },
};

export const draftPrNodeNoCi = {
  ...validPrNode,
  id: "PR_2",
  number: 43,
  title: "WIP: refactor cart",
  isDraft: true,
  labels: { nodes: [] },
  reviewDecision: null,
  reviews: { nodes: [] },
  agentCommits: { nodes: [] },
  commits: { nodes: [{ commit: { statusCheckRollup: null } }] },
};

/** codex-review met daarna een gepushte fixcommit op de head-branch. */
export const prNodeWithAgentFixes = {
  ...validPrNode,
  id: "PR_3",
  number: 44,
  reviews: {
    nodes: [
      {
        author: { login: "codex" },
        submittedAt: "2026-07-02T08:00:00Z",
        comments: { totalCount: 2 },
      },
    ],
  },
  agentCommits: {
    nodes: [
      { commit: { author: { user: { login: "codex" } } } },
      { commit: { author: { user: { login: "dennis" } } } },
    ],
  },
};

export const searchResponse = {
  data: {
    viewer: { login: "octocat" },
    reviewRequested: { nodes: [validPrNode] },
    assigned: { nodes: [] },
    authored: { nodes: [draftPrNodeNoCi] },
  },
};
