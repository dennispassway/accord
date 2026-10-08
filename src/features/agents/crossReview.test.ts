import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { validPrNode } from "../../lib/github/fixtures/search-response";
import { parseSearchResponse } from "../../lib/github/parse";
import {
  availableFixer,
  availableFixModes,
  preferredFixer,
  preferredReviewer,
  shouldDistillAfterMerge,
} from "./crossReview";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "1",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(1),
    title: "Some PR",
    url: "https://github.com/acme/widgets/pull/1",
    headRef: "feature",
    baseRef: "main",
    author: { kind: "human", login: "dennispassway" },
    ciStatus: { state: "success" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    additions: 1,
    deletions: 1,
    comments: 0,
    openThreads: 0,
    reviewers: [],
    agentReviews: [],
    agentCommitCount: 0,
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    ...overrides,
  };
}

describe("availableFixModes", () => {
  it("geeft een lege lijst bij een schone PR", () => {
    expect(availableFixModes(makePr())).toEqual([]);
  });

  it("geeft fixComments en distillLearnings bij openstaande threads", () => {
    expect(availableFixModes(makePr({ comments: 3, openThreads: 1 }))).toEqual([
      "fixComments",
      "distillLearnings",
    ]);
  });

  it("geeft geen fixComments als alle threads opgelost zijn, wel lessen (B4)", () => {
    expect(availableFixModes(makePr({ comments: 3, openThreads: 0 }))).toEqual([
      "distillLearnings",
    ]);
  });

  it("geeft fixChecks bij een falende check", () => {
    expect(
      availableFixModes(
        makePr({ ciStatus: { state: "failure", failedChecks: ["build"] } }),
      ),
    ).toEqual(["fixChecks"]);
  });

  it("geeft fixConflicts bij een mergeconflict", () => {
    expect(availableFixModes(makePr({ mergeable: "CONFLICTING" }))).toEqual([
      "fixConflicts",
    ]);
  });

  it("geeft alles in de volgorde conflicts, checks, comments, lessen", () => {
    expect(
      availableFixModes(
        makePr({
          mergeable: "CONFLICTING",
          ciStatus: { state: "failure", failedChecks: ["build"] },
          comments: 2,
          openThreads: 2,
        }),
      ),
    ).toEqual(["fixConflicts", "fixChecks", "fixComments", "distillLearnings"]);
  });
});

describe("shouldDistillAfterMerge", () => {
  const agentReview = (commitCount: number) => ({
    agent: "claude" as const,
    mode: "commentsAndFixes" as const,
    commentCount: 0,
    commitCount,
    submittedAt: "2026-01-01T00:00:00Z",
  });

  it("is true bij aan en comments", () => {
    expect(shouldDistillAfterMerge(makePr({ comments: 2 }), true)).toBe(true);
  });

  it("is true bij aan en alleen fix-commits van een agent", () => {
    expect(shouldDistillAfterMerge(makePr({ agentCommitCount: 1 }), true)).toBe(
      true,
    );
  });

  it("is true bij een agent-fixcommit zonder review of comments, via de parser", () => {
    const [pr] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          comments: { totalCount: 0 },
          reviewThreads: { totalCount: 0, nodes: [] },
          reviews: { nodes: [] },
          agentCommits: {
            nodes: [{ commit: { author: { user: { login: "codex[bot]" } } } }],
          },
        },
      ],
    });
    expect(pr?.comments).toBe(0);
    expect(pr?.agentReviews).toEqual([]);
    expect(pr && shouldDistillAfterMerge(pr, true)).toBe(true);
  });

  it("is false bij aan, 0 comments en 0 commits", () => {
    expect(
      shouldDistillAfterMerge(makePr({ agentReviews: [agentReview(0)] }), true),
    ).toBe(false);
  });

  it("is false als de instelling uit staat", () => {
    expect(shouldDistillAfterMerge(makePr({ comments: 2 }), false)).toBe(false);
  });
});

describe("shouldDistillAfterMerge met bestaande distill-run", () => {
  it("is false als er al een distill-run actief of geslaagd is", () => {
    expect(shouldDistillAfterMerge(makePr({ comments: 2 }), true, true)).toBe(
      false,
    );
  });

  it("is true zonder eerdere distill-run", () => {
    expect(shouldDistillAfterMerge(makePr({ comments: 2 }), true, false)).toBe(
      true,
    );
  });
});

describe("availableFixer", () => {
  const both = { claude: true, codex: true };

  it("kiest de voorkeursagent als die beschikbaar is", () => {
    expect(availableFixer(makePr(), both, "/repo")).toBe("codex");
  });

  it("valt terug op de andere agent als de CLI van de voorkeur ontbreekt", () => {
    expect(
      availableFixer(makePr(), { claude: true, codex: false }, "/repo"),
    ).toBe("claude");
  });

  it("geeft null als geen van beide CLI's beschikbaar is", () => {
    expect(
      availableFixer(makePr(), { claude: false, codex: false }, "/repo"),
    ).toBeNull();
  });

  it("geeft null zonder repoPath", () => {
    expect(availableFixer(makePr(), both, undefined)).toBeNull();
    expect(availableFixer(makePr(), both, "")).toBeNull();
  });
});

describe("preferredFixer", () => {
  it("laat de andere agent fixen dan die het laatst reviewde", () => {
    const pr = makePr({
      agentReviews: [
        {
          agent: "claude",
          mode: "commentsOnly",
          commentCount: 2,
          commitCount: 0,
          submittedAt: "2026-09-20T10:00:00Z",
        },
        {
          agent: "codex",
          mode: "commentsOnly",
          commentCount: 1,
          commitCount: 0,
          submittedAt: "2026-09-21T10:00:00Z",
        },
      ],
    });
    expect(preferredFixer(pr)).toBe("claude");
  });

  it("valt zonder agent-review terug op de tegenhanger van de reviewer", () => {
    expect(preferredFixer(makePr())).toBe("codex");
    expect(
      preferredFixer(
        makePr({
          author: { kind: "agent", agent: "claude", login: "claude[bot]" },
        }),
      ),
    ).toBe("claude");
  });
});

describe("preferredReviewer", () => {
  it("laat Codex een PR van Claude reviewen", () => {
    expect(
      preferredReviewer({
        kind: "agent",
        agent: "claude",
        login: "claude[bot]",
      }),
    ).toBe("codex");
  });

  it("laat Claude een PR van Codex reviewen", () => {
    expect(
      preferredReviewer({ kind: "agent", agent: "codex", login: "codex[bot]" }),
    ).toBe("claude");
  });

  it("kiest Claude bij een menselijke auteur", () => {
    expect(preferredReviewer({ kind: "human", login: "dennis" })).toBe(
      "claude",
    );
  });
});
