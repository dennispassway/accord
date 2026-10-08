import { describe, expect, it } from "vitest";
import type { AgentReview } from "../../lib/github/domain";
import { latestVerdict } from "./VerdictBadge";

function review(
  agent: AgentReview["agent"],
  submittedAt: string,
  verdict?: AgentReview["verdict"],
): AgentReview {
  return {
    agent,
    mode: "commentsOnly",
    commentCount: 1,
    commitCount: 0,
    submittedAt,
    ...(verdict && { verdict }),
  };
}

describe("latestVerdict", () => {
  it("geeft undefined zonder agent-reviews", () => {
    expect(latestVerdict({ agentReviews: [] })).toBeUndefined();
  });

  it("neemt het verdict van de nieuwste review over agents heen", () => {
    expect(
      latestVerdict({
        agentReviews: [
          review("claude", "2026-07-03T08:00:00Z", {
            fixes: "geen",
            verificatie: "ci",
          }),
          review("codex", "2026-07-02T08:00:00Z", {
            fixes: "nodig",
            verificatie: "ci",
          }),
        ],
      }),
    ).toEqual({ fixes: "geen", verificatie: "ci" });
  });

  it("geeft undefined als de nieuwste review geen verdict heeft", () => {
    expect(
      latestVerdict({
        agentReviews: [
          review("claude", "2026-07-03T08:00:00Z"),
          review("codex", "2026-07-02T08:00:00Z", {
            fixes: "nodig",
            verificatie: "ci",
          }),
        ],
      }),
    ).toBeUndefined();
  });
});
