import { describe, expect, it } from "vitest";
import { buildSearchQueries, SEARCH_PRS_QUERY } from "./queries";

describe("buildSearchQueries", () => {
  it("builds the three @me search queries", () => {
    expect(buildSearchQueries()).toEqual({
      reviewRequested: "is:open is:pr review-requested:@me archived:false",
      assigned: "is:open is:pr assignee:@me archived:false",
      authored: "is:open is:pr author:@me archived:false",
    });
  });
});

describe("SEARCH_PRS_QUERY", () => {
  it("aliases the three searches and includes the PR fragment fields", () => {
    expect(SEARCH_PRS_QUERY).toContain("viewer { login }");
    expect(SEARCH_PRS_QUERY).toContain("reviewRequested: search");
    expect(SEARCH_PRS_QUERY).toContain("assigned: search");
    expect(SEARCH_PRS_QUERY).toContain("authored: search");
    expect(SEARCH_PRS_QUERY).toContain("nameWithOwner");
    expect(SEARCH_PRS_QUERY).toContain("statusCheckRollup");
    expect(SEARCH_PRS_QUERY).toContain("reviewDecision");
    expect(SEARCH_PRS_QUERY).toContain("comments { totalCount }");
    expect(SEARCH_PRS_QUERY).toContain("reviewThreads(first: 1)");
    expect(SEARCH_PRS_QUERY).toContain("assignees(first: 20)");
    expect(SEARCH_PRS_QUERY).toContain("reviewRequests(first: 20)");
    expect(SEARCH_PRS_QUERY).toContain("latestOpinionatedReviews(first: 20)");
    expect(SEARCH_PRS_QUERY).toContain("reviews(first: 20)");
    expect(SEARCH_PRS_QUERY).toContain("agentCommits: commits(last: 10)");
  });

  it("vraagt 100 resultaten per search op en geeft issueCount mee (afkap-indicator)", () => {
    expect(SEARCH_PRS_QUERY).toContain(
      "reviewRequested: search(query: $reviewRequested, type: ISSUE, first: 100) {\n    issueCount\n    nodes { ...PrFields }",
    );
    expect(SEARCH_PRS_QUERY).toContain(
      "assigned: search(query: $assigned, type: ISSUE, first: 100) {\n    issueCount\n    nodes { ...PrFields }",
    );
    expect(SEARCH_PRS_QUERY).toContain(
      "authored: search(query: $authored, type: ISSUE, first: 100) {\n    issueCount\n    nodes { ...PrFields }",
    );
  });
});
