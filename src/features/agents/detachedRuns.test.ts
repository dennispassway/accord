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
    expect(detachedRuns([merged], new Set(), new Set())).toEqual([merged]);
  });

  it("laat een run op een PR die nog in de lijst staat weg", () => {
    expect(
      detachedRuns([run({})], new Set(["acme/widgets#94"]), new Set()),
    ).toEqual([]);
  });

  it("matcht op repo en nummer, niet op het nummer alleen", () => {
    const merged = run({});
    expect(
      detachedRuns([merged], new Set(["acme/other#94"]), new Set()),
    ).toEqual([merged]);
  });

  it("laat een afgeronde run weg die de gebruiker sloot", () => {
    expect(
      detachedRuns([run({ status: "failed" })], new Set(), new Set(["r1"])),
    ).toEqual([]);
  });

  it("laat een afgeronde run zonder openstaand werk weg", () => {
    // Een review-run op een PR die later gemerged werd: niets meer te doen.
    for (const status of ["done", "cancelled"] as const) {
      expect(detachedRuns([run({ status })], new Set(), new Set())).toEqual([]);
    }
  });

  it("houdt een afgeronde run met openstaand werk zichtbaar", () => {
    const actionable = [
      run({ status: "failed" }),
      run({ status: "done", keptWorktree: "/tmp/wt", unpushedCommits: 2 }),
      run({ status: "done", reviewMissing: true }),
    ];
    for (const finished of actionable) {
      expect(detachedRuns([finished], new Set(), new Set())).toEqual([
        finished,
      ]);
    }
  });

  it("houdt een lopende run zichtbaar, ook als hij gesloten zou zijn", () => {
    const running = run({});
    expect(detachedRuns([running], new Set(), new Set(["r1"]))).toEqual([
      running,
    ]);
  });
});
