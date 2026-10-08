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
      detachedRuns([run({ status: "done" })], new Set(), new Set(["r1"])),
    ).toEqual([]);
  });

  it("houdt een lopende run zichtbaar, ook als hij gesloten zou zijn", () => {
    const running = run({});
    expect(detachedRuns([running], new Set(), new Set(["r1"]))).toEqual([
      running,
    ]);
  });
});
