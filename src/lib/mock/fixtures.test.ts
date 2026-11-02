import { describe, expect, it } from "vitest";
import { prStatus } from "../../features/prs/rank";
import { buildSections, type SortCtx } from "../../features/prs/sort";
import { computeStackInfo } from "../github/stacks";
import { DEFAULT_HIGH_RISK_PATTERNS, NORMAL_GATE, riskGate } from "../risk";
import { MOCK_PRS } from "./fixtures";

const blocked = new Set(
  computeStackInfo(MOCK_PRS)
    .filter((info) => info.blockedByPrNumbers.length > 0)
    .map((info) => `${info.repoId}#${info.number}`),
);
const ctx: SortCtx = {
  isAgentBezig: () => false,
  isStackBlocked: (pr) => blocked.has(`${pr.repoId}#${pr.number}`),
  riskOf: () => NORMAL_GATE,
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
    ).filter(
      (pr) =>
        prStatus(pr, {
          agentBezig: false,
          stackBlocked: ctx.isStackBlocked(pr),
          risk: NORMAL_GATE,
        }).problem == null,
    );
    expect(clean.length).toBeGreaterThan(0);
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

describe("mockdata toont risiconiveaus", () => {
  const gate = (id: string) => {
    const pr = MOCK_PRS.find((p) => p.id === id);
    if (!pr) throw new Error(`geen mock-PR ${id}`);
    return { pr, gate: riskGate(pr, DEFAULT_HIGH_RISK_PATTERNS, new Set()) };
  };

  it("hoog risico van een ander zonder approval blokkeert", () => {
    const { pr, gate: g } = gate("pay88");
    expect(pr.authoredByMe).toBe(false);
    expect(g.needsHumanReview).toBe(true);
    expect(g.reasons).toEqual([
      "src/payments/mollie.ts",
      "src/checkout/refund.ts",
    ]);
  });

  it("een eigen hoog-risico-PR blokkeert en kan een override krijgen", () => {
    const { pr, gate: g } = gate("mig91");
    expect(pr.authoredByMe).toBe(true);
    expect(g.needsHumanReview).toBe(true);
  });

  it("hoog risico met menselijke approval op de head blokkeert niet", () => {
    const { gate: g } = gate("wfl93");
    expect(g.tier).toBe("hoog");
    expect(g.needsHumanReview).toBe(false);
  });
});
