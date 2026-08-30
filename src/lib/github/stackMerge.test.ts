import { describe, expect, it, vi } from "vitest";
import type { CiStatus, PullRequest, ReviewState } from "./domain";
import { toPrNumber, toRepoId } from "./domain";
import type { StackMergeDeps } from "./stackMerge";
import { runStackMerge } from "./stackMerge";

function pr(number: number, overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: `octocat-${number}`,
    repoId: toRepoId("acme/octocat"),
    number: toPrNumber(number),
    title: `PR ${number}`,
    url: `https://github.com/acme/octocat/pull/${number}`,
    headRef: `feat/${number}`,
    baseRef: number === 1 ? "main" : `feat/${number - 1}`,
    author: { kind: "human", login: "monalisa" },
    ciStatus: { state: "success" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    priority: null,
    createdAt: "2026-08-01T00:00:00.000Z",
    updatedAt: "2026-08-01T00:00:00.000Z",
    additions: 10,
    deletions: 2,
    comments: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    ...overrides,
  };
}

function ci(state: CiStatus["state"]): CiStatus {
  return state === "failure" ? { state, failedChecks: [] } : { state };
}

function review(state: ReviewState["state"]): ReviewState {
  return { state } as ReviewState;
}

/** Bouwt deps met een register van verse snapshots per prKey; `mergeStep`
 * en `refreshPr` zijn stubs die de test overschrijft waar nodig. */
function makeDeps(
  overrides: Partial<StackMergeDeps> = {},
): StackMergeDeps & { progressLog: unknown[] } {
  const progressLog: unknown[] = [];
  return {
    progressLog,
    mergeStep: vi.fn().mockResolvedValue("merged"),
    refreshPr: vi.fn().mockResolvedValue(null),
    delay: vi.fn().mockResolvedValue(undefined),
    onProgress: vi.fn((p) => progressLog.push(p)),
    isCancelled: () => false,
    ...overrides,
  };
}

describe("runStackMerge", () => {
  it("merget een keten van 3 PR's volledig als elke stap groen blijft", async () => {
    const chain = [pr(1), pr(2), pr(3)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async (key: string) => {
        const number = Number(key.split("#")[1]);
        return chain.find((p) => p.number === number) ?? null;
      }),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({ gemerged: [1, 2, 3] });
    expect(deps.mergeStep).toHaveBeenCalledTimes(3);
    expect(deps.onProgress).toHaveBeenLastCalledWith(null);
  });

  it("keten van 1 PR merget zonder te pollen", async () => {
    const chain = [pr(1)];
    const deps = makeDeps();

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({ gemerged: [1] });
    expect(deps.delay).not.toHaveBeenCalled();
  });

  it("stopt met rodeCi als de CI van de volgende stap rood wordt tijdens het pollen", async () => {
    const chain = [pr(1), pr(2, { ciStatus: ci("pending") }), pr(3)];
    const deps = makeDeps({
      refreshPr: vi
        .fn()
        .mockResolvedValueOnce(pr(2, { ciStatus: ci("pending") }))
        .mockResolvedValueOnce(pr(2, { ciStatus: ci("failure") })),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [1],
      gestopt: { reden: "rodeCi", prNumber: 2 },
    });
    expect(deps.mergeStep).toHaveBeenCalledTimes(1);
  });

  it("annuleren tijdens het wachten op CI stopt met geannuleerd, zonder te mergen", async () => {
    const chain = [pr(1), pr(2, { ciStatus: ci("pending") })];
    let cancelled = false;
    const deps = makeDeps({
      refreshPr: vi.fn().mockResolvedValue(pr(2, { ciStatus: ci("pending") })),
      isCancelled: () => cancelled,
      delay: vi.fn().mockImplementation(async () => {
        cancelled = true;
      }),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [1],
      gestopt: { reden: "geannuleerd", prNumber: 2 },
    });
    expect(deps.mergeStep).toHaveBeenCalledTimes(1);
  });

  it("stopt vooraf met changesRequested zonder te mergen of te pollen", async () => {
    const chain = [pr(1, { reviewState: review("changesRequested") }), pr(2)];
    const deps = makeDeps();

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [],
      gestopt: { reden: "changesRequested", prNumber: 1 },
    });
    expect(deps.mergeStep).not.toHaveBeenCalled();
  });

  it("stopt met rebaseMislukt als mergeStep een rebase-conflict teruggeeft", async () => {
    const chain = [pr(1), pr(2), pr(3)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async (key: string) => {
        const number = Number(key.split("#")[1]);
        return chain.find((p) => p.number === number) ?? null;
      }),
      mergeStep: vi
        .fn()
        .mockResolvedValueOnce("merged")
        .mockResolvedValueOnce("rebase-conflict"),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [1],
      gestopt: { reden: "rebaseMislukt", prNumber: 2 },
    });
    expect(deps.mergeStep).toHaveBeenCalledTimes(2);
  });

  it("annuleren vóór de eerste stap stopt zonder iets te mergen", async () => {
    const chain = [pr(1), pr(2)];
    const deps = makeDeps({ isCancelled: () => true });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [],
      gestopt: { reden: "geannuleerd", prNumber: 1 },
    });
    expect(deps.mergeStep).not.toHaveBeenCalled();
  });

  it("BLOCKER 1: een gooiende mergeStep stopt met mergeMislukt in plaats van een unhandled rejection", async () => {
    const chain = [pr(1), pr(2)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async (key: string) => {
        const number = Number(key.split("#")[1]);
        return chain.find((p) => p.number === number) ?? null;
      }),
      mergeStep: vi
        .fn()
        .mockResolvedValueOnce("merged")
        .mockRejectedValueOnce(new Error("403")),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [1],
      gestopt: { reden: "mergeMislukt", prNumber: 2 },
    });
    expect(deps.onProgress).toHaveBeenLastCalledWith(null);
  });

  it("BLOCKER 2: ciStatus 'none' telt als groen en stopt het pollen niet oneindig", async () => {
    const chain = [pr(1), pr(2, { ciStatus: ci("none") }), pr(3)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async (key: string) => {
        const number = Number(key.split("#")[1]);
        return chain.find((p) => p.number === number) ?? null;
      }),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({ gemerged: [1, 2, 3] });
    expect(deps.delay).toHaveBeenCalled();
  });

  it("BLOCKER 2: refreshPr die null teruggeeft stopt met prVerdwenen in plaats van oneindig door te pollen", async () => {
    const chain = [pr(1), pr(2, { ciStatus: ci("pending") }), pr(3)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockResolvedValue(null),
    });

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [1],
      gestopt: { reden: "prVerdwenen", prNumber: 2 },
    });
    expect(deps.mergeStep).toHaveBeenCalledTimes(1);
  });

  it("SHOULD 4: wacht één pollInterval vóór de allereerste refresh van een stap", async () => {
    const chain = [pr(1), pr(2)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async (key: string) => {
        const number = Number(key.split("#")[1]);
        return chain.find((p) => p.number === number) ?? null;
      }),
    });

    await runStackMerge(deps, chain, 10);

    expect(deps.delay).toHaveBeenCalledWith(10);
  });

  it("SHOULD 5: een draft-PR stopt vooraf met nietMergebaar", async () => {
    const chain = [pr(1, { isDraft: true }), pr(2)];
    const deps = makeDeps();

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [],
      gestopt: { reden: "nietMergebaar", prNumber: 1 },
    });
    expect(deps.mergeStep).not.toHaveBeenCalled();
  });

  it("SHOULD 5: een PR met mergeable UNKNOWN stopt vooraf met nietMergebaar", async () => {
    const chain = [pr(1, { mergeable: "UNKNOWN" }), pr(2)];
    const deps = makeDeps();

    const result = await runStackMerge(deps, chain, 10);

    expect(result).toEqual({
      gemerged: [],
      gestopt: { reden: "nietMergebaar", prNumber: 1 },
    });
    expect(deps.mergeStep).not.toHaveBeenCalled();
  });

  it("voortgang draagt de repoId mee, zodat de UI niet op kaal PR-nummer matcht", async () => {
    const chain = [pr(1), pr(2)];
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async (key: string) => {
        const number = Number(key.split("#")[1]);
        return chain.find((p) => p.number === number) ?? null;
      }),
    });

    await runStackMerge(deps, chain, 10);

    const gemeld = deps.progressLog.filter((p) => p != null);
    expect(gemeld.length).toBeGreaterThan(0);
    for (const p of gemeld) {
      expect(p).toMatchObject({ repoId: "acme/octocat" });
    }
  });

  it("NIT 9: annuleren tussen twee poll-ticks doet geen extra refreshPr-call meer", async () => {
    const chain = [pr(1), pr(2, { ciStatus: ci("pending") })];
    let cancelled = false;
    let delayCalls = 0;
    let refreshCalls = 0;
    const deps = makeDeps({
      refreshPr: vi.fn().mockImplementation(async () => {
        refreshCalls++;
        return pr(2, { ciStatus: ci("pending") });
      }),
      isCancelled: () => cancelled,
      delay: vi.fn().mockImplementation(async () => {
        delayCalls++;
        // Pas na de tweede delay (dus ná de eerste refresh) annuleren, zodat
        // deze test aantoont dat de daaropvolgende tick geen refresh meer doet.
        if (delayCalls >= 2) cancelled = true;
      }),
    });

    await runStackMerge(deps, chain, 10);

    expect(refreshCalls).toBe(1);
  });
});
