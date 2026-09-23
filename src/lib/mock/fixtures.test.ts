import { describe, expect, it } from "vitest";
import { buildSections, type SortCtx } from "../../features/prs/sort";
import { computeStackInfo } from "../github/stacks";
import { MOCK_PRS } from "./fixtures";

const blocked = new Set(
  computeStackInfo(MOCK_PRS)
    .filter((info) => info.blockedByPrNumbers.length > 0)
    .map((info) => `${info.repoId}#${info.number}`),
);
const ctx: SortCtx = {
  isAgentBezig: () => false,
  isStackBlocked: (pr) => blocked.has(`${pr.repoId}#${pr.number}`),
};
const sections = buildSections(MOCK_PRS, "triage", ctx);

function idsIn(key: string): string[] {
  return sections.find((s) => s.key === key)?.prs.map((pr) => pr.id) ?? [];
}

describe("mockdata toont rol eerst", () => {
  it("#49 met conflict staat onderaan in jouw review nodig", () => {
    const review = idsIn("review");
    expect(review).toContain("hoc49");
    const conflictIndex = review.indexOf("hoc49");
    const clean = MOCK_PRS.filter(
      (pr) => review.includes(pr.id) && pr.mergeable === "MERGEABLE",
    ).filter((pr) => pr.ciStatus.state !== "failure");
    for (const pr of clean) {
      expect(review.indexOf(pr.id)).toBeLessThan(conflictIndex);
    }
  });

  it("eigen PR met verplichte review staat in wacht op review", () => {
    expect(idsIn("wachtReview")).toContain("nts115");
  });

  it("eigen PR die achterloopt staat in actie nodig", () => {
    expect(idsIn("actie")).toContain("mee61");
  });
});
