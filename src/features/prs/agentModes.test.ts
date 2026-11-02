import { describe, expect, it } from "vitest";
import {
  forceRoundRequest,
  isAdviceRound,
  nextReviewRound,
  showsRound,
} from "./agentModes";

const rounds = (agentReviewRounds: number) => ({ agentReviewRounds });

describe("review-rondes", () => {
  it("is de volgende ronde het aantal eerdere reviews plus één", () => {
    expect(nextReviewRound(rounds(0))).toBe(1);
    expect(nextReviewRound(rounds(2))).toBe(3);
  });

  it("toont pas een ronde-label na de eerste review", () => {
    expect(showsRound(rounds(0))).toBe(false);
    expect(showsRound(rounds(1))).toBe(true);
  });

  it("geeft alleen withFixes vanaf ronde 3 als advies", () => {
    expect(isAdviceRound(rounds(1), "withFixes")).toBe(false);
    expect(isAdviceRound(rounds(2), "withFixes")).toBe(true);
    expect(isAdviceRound(rounds(2), "commentsOnly")).toBe(false);
    expect(isAdviceRound(rounds(5), "fixChecks")).toBe(false);
  });

  it("forceert altijd withFixes, en alleen als die modus advies zou zijn", () => {
    expect(forceRoundRequest(rounds(1), "claude")).toBeUndefined();
    expect(forceRoundRequest(rounds(2), "codex")).toEqual({
      agent: "codex",
      mode: "withFixes",
      forceRound: true,
    });
  });
});
