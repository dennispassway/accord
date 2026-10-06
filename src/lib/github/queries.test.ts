import { describe, expect, it } from "vitest";
import {
  buildSearchQueries,
  PR_NODES_QUERY,
  SEARCH_PR_IDS_QUERY,
} from "./queries";

describe("buildSearchQueries", () => {
  it("builds the three @me search queries", () => {
    expect(buildSearchQueries()).toEqual({
      reviewRequested: "is:open is:pr review-requested:@me archived:false",
      assigned: "is:open is:pr assignee:@me archived:false",
      authored: "is:open is:pr author:@me archived:false",
    });
  });
});

describe("SEARCH_PR_IDS_QUERY", () => {
  it("vraagt 100 resultaten per search op, met issueCount (afkap-indicator) en alleen de id", () => {
    expect(SEARCH_PR_IDS_QUERY).toContain("viewer { login }");
    expect(SEARCH_PR_IDS_QUERY).toContain(
      "reviewRequested: search(query: $reviewRequested, type: ISSUE, first: 100) {\n    issueCount\n    nodes { ... on PullRequest { id } }",
    );
    expect(SEARCH_PR_IDS_QUERY).toContain(
      "assigned: search(query: $assigned, type: ISSUE, first: 100) {\n    issueCount\n    nodes { ... on PullRequest { id } }",
    );
    expect(SEARCH_PR_IDS_QUERY).toContain(
      "authored: search(query: $authored, type: ISSUE, first: 100) {\n    issueCount\n    nodes { ... on PullRequest { id } }",
    );
  });

  it("laat de dure velden weg, die komen per batch uit PR_NODES_QUERY", () => {
    expect(SEARCH_PR_IDS_QUERY).not.toContain("PrFields");
    expect(SEARCH_PR_IDS_QUERY).not.toContain("mergeStateStatus");
  });
});

describe("PR_NODES_QUERY", () => {
  it("haalt de PR fragment fields op voor een lijst id's", () => {
    expect(PR_NODES_QUERY).toContain("nodes(ids: $ids) { ...PrFields }");
    expect(PR_NODES_QUERY).toContain("nameWithOwner");
    expect(PR_NODES_QUERY).toContain("statusCheckRollup");
    expect(PR_NODES_QUERY).toContain("reviewDecision");
    expect(PR_NODES_QUERY).toContain("comments { totalCount }");
    expect(PR_NODES_QUERY).toContain(
      "reviewThreads(first: 100) { totalCount nodes { isResolved } }",
    );
    expect(PR_NODES_QUERY).toContain("mergeStateStatus");
    expect(PR_NODES_QUERY).toContain("assignees(first: 20)");
    expect(PR_NODES_QUERY).toContain("reviewRequests(first: 20)");
    expect(PR_NODES_QUERY).toContain("latestOpinionatedReviews(first: 20)");
    // De nieuwste reviews: Accord herkent zijn eigen reviews aan een marker,
    // en op een PR met veel reviews vielen die met first: 20 buiten beeld.
    expect(PR_NODES_QUERY).toContain("reviews(last: 50)");
    expect(PR_NODES_QUERY).toContain("agentCommits: commits(last: 10)");
  });
});
