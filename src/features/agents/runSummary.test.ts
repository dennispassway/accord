import { describe, expect, it } from "vitest";
import type { AgentMode } from "./crossReview";
import { summarizeRun } from "./runSummary";
import type { AgentRun } from "./useAgentRuns";

/** Union-lijst-uit-record.md: dit record dwingt af dat elk lid van AgentMode
 * hier langskomt; een nieuwe mode geeft een typefout in plaats van stil over
 * te slaan. */
const ALL_MODES: Record<AgentMode, true> = {
  commentsOnly: true,
  withFixes: true,
  fixComments: true,
  fixChecks: true,
  fixConflicts: true,
  distillLearnings: true,
  distillLearningsInline: true,
};

const START = 1_000_000;

function makeRun(overrides: Partial<AgentRun> = {}): AgentRun {
  return {
    runId: "run-1",
    prKey: "acme/storefront#167",
    agent: "claude",
    mode: "withFixes",
    status: "running",
    lines: [],
    startedAt: START,
    ...overrides,
  };
}

describe("summarizeRun: elke modus", () => {
  for (const mode of Object.keys(ALL_MODES) as AgentMode[]) {
    it(`toont het modus-label voor ${mode}`, () => {
      const run = makeRun({ mode, status: "cancelled" });
      expect(summarizeRun(run, START)).toContain("geannuleerd");
    });
  }
});

describe("summarizeRun: elke status", () => {
  it("running: bezig sinds N min", () => {
    const run = makeRun({ status: "running" });
    const now = START + 2 * 60_000;
    expect(summarizeRun(run, now)).toBe(
      "Comments + fixes · Claude · bezig sinds 2 min",
    );
  });

  it("cancelled: geannuleerd, zonder duur", () => {
    const run = makeRun({ status: "cancelled" });
    expect(summarizeRun(run, START + 60_000)).toBe(
      "Comments + fixes · Claude · geannuleerd",
    );
  });

  it("failed met exitcode: gefaald (code N)", () => {
    const run = makeRun({ status: "failed", exitCode: 1 });
    expect(summarizeRun(run, START)).toBe(
      "Comments + fixes · Claude · gefaald (code 1)",
    );
  });

  it("failed zonder bekende exitcode: gefaald zonder code-suffix", () => {
    const run = makeRun({ status: "failed", exitCode: undefined });
    expect(summarizeRun(run, START)).toBe(
      "Comments + fixes · Claude · gefaald",
    );
  });

  it("done bij fixChecks: duur plus gepushte commits", () => {
    const run = makeRun({
      mode: "fixChecks",
      status: "done",
      finishedAt: START + 4 * 60_000,
      pushedCommits: 2,
      unpushedCommits: 0,
    });
    expect(summarizeRun(run, START + 10 * 60_000)).toBe(
      "Fix checks · Claude · 4 min · 2 commits gepusht",
    );
  });

  it("done bij fixConflicts: commits die alleen lokaal staan", () => {
    const run = makeRun({
      mode: "fixConflicts",
      status: "done",
      finishedAt: START + 6 * 60_000,
      pushedCommits: 0,
      unpushedCommits: 3,
    });
    expect(summarizeRun(run, START + 10 * 60_000)).toBe(
      "Los conflict op · Claude · 6 min · 3 commits alleen lokaal",
    );
  });

  it("done bij commentsOnly: review geplaatst, geen commit-telling", () => {
    const run = makeRun({
      agent: "codex",
      mode: "commentsOnly",
      status: "done",
      finishedAt: START + 3 * 60_000,
    });
    expect(summarizeRun(run, START + 3 * 60_000)).toBe(
      "Comments · Codex · 3 min · review geplaatst",
    );
  });

  it("done zonder commits: geen wijzigingen", () => {
    const run = makeRun({
      mode: "distillLearnings",
      status: "done",
      finishedAt: START + 60_000,
      pushedCommits: 0,
      unpushedCommits: 0,
    });
    expect(summarizeRun(run, START + 60_000)).toBe(
      "Lessen vastleggen · Claude · 1 min · geen wijzigingen",
    );
  });

  it("done: enkelvoud bij precies 1 commit", () => {
    const run = makeRun({
      mode: "fixComments",
      status: "done",
      finishedAt: START + 60_000,
      pushedCommits: 1,
      unpushedCommits: 0,
    });
    expect(summarizeRun(run, START + 60_000)).toBe(
      "Fix bevindingen · Claude · 1 min · 1 commit gepusht",
    );
  });
});
