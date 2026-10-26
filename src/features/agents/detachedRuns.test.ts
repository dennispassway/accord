import { describe, expect, it } from "vitest";
import { detachedRuns } from "./detachedRuns";
import type { AgentRun } from "./useAgentRuns";

function run(overrides: Partial<AgentRun>): AgentRun {
  return {
    runId: "r1",
    prKey: "acme/widgets#94",
    agent: "codex",
    mode: "distillLearnings",
    status: "running",
    lines: [],
    startedAt: 0,
    ...overrides,
  };
}

describe("detachedRuns", () => {
  it("geeft een run terug waarvan de PR niet meer in de lijst staat", () => {
    const merged = run({});
    expect(detachedRuns([merged], new Set())).toEqual([merged]);
  });

  it("laat een run op een PR die nog in de lijst staat weg", () => {
    expect(detachedRuns([run({})], new Set(["acme/widgets#94"]))).toEqual([]);
  });

  it("matcht op repo en nummer, niet op het nummer alleen", () => {
    const merged = run({});
    expect(detachedRuns([merged], new Set(["acme/other#94"]))).toEqual([
      merged,
    ]);
  });

  it("laat een afgeronde run weg die de gebruiker sloot", () => {
    expect(
      detachedRuns([run({ status: "failed", dismissed: true })], new Set()),
    ).toEqual([]);
  });

  it("laat een geslaagde run zonder openstaand werk weg", () => {
    // Een review-run op een PR die later gemerged werd: niets meer te doen.
    expect(detachedRuns([run({ status: "done" })], new Set())).toEqual([]);
  });

  it("houdt een afgeronde run met openstaand werk zichtbaar", () => {
    const actionable = [
      run({ status: "failed" }),
      run({ status: "cancelled" }),
      run({ status: "done", keptWorktree: "/tmp/wt", unpushedCommits: 2 }),
    ];
    for (const finished of actionable) {
      expect(detachedRuns([finished], new Set())).toEqual([finished]);
    }
  });

  it("houdt een lopende run zichtbaar, ook als hij gesloten zou zijn", () => {
    const running = run({ dismissed: true });
    expect(detachedRuns([running], new Set())).toEqual([running]);
  });
});
