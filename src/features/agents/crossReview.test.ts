import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import {
  availableFixModes,
  chainsIntoLearnings,
  preferredReviewer,
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
    priority: null,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
    additions: 1,
    deletions: 1,
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

describe("availableFixModes", () => {
  it("geeft een lege lijst bij een schone PR", () => {
    expect(availableFixModes(makePr())).toEqual([]);
  });

  it("geeft fixComments en distillLearnings bij openstaande comments", () => {
    expect(availableFixModes(makePr({ comments: 3 }))).toEqual([
      "fixComments",
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
        }),
      ),
    ).toEqual(["fixConflicts", "fixChecks", "fixComments", "distillLearnings"]);
  });
});

describe("chainsIntoLearnings", () => {
  it("chaint na runs die comments verwerken en fixes toepassen", () => {
    expect(chainsIntoLearnings("fixComments")).toBe(true);
    expect(chainsIntoLearnings("withFixes")).toBe(true);
  });

  it("chaint niet na distillLearnings zelf (geen loop) of modes zonder comments", () => {
    expect(chainsIntoLearnings("distillLearnings")).toBe(false);
    expect(chainsIntoLearnings("distillLearningsInline")).toBe(false);
    expect(chainsIntoLearnings("commentsOnly")).toBe(false);
    expect(chainsIntoLearnings("fixChecks")).toBe(false);
    expect(chainsIntoLearnings("fixConflicts")).toBe(false);
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
