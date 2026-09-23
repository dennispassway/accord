import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { type PrStatusKey, prStatus } from "./rank";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "1",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(1),
    title: "Some PR",
    url: "https://github.com/acme/widgets/pull/1",
    headRef: "feature",
    baseRef: "main",
    author: { kind: "human", login: "octocat" },
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
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: true,
    ...overrides,
  };
}

/** PR van iemand anders waarop mijn review gevraagd is. */
function reviewPr(overrides: Partial<PullRequest> = {}): PullRequest {
  return makePr({
    author: { kind: "human", login: "hubot" },
    authoredByMe: false,
    reviewRequestedFromMe: true,
    ...overrides,
  });
}

const idleCtx = { agentBezig: false, stackBlocked: false };

describe("prStatus: eigen PR", () => {
  it("klaar om te mergen als niets in de weg staat", () => {
    expect(prStatus(makePr(), idleCtx)).toEqual({
      rank: 1,
      key: "klaar",
      label: "klaar om te mergen",
      short: "klaar",
      problem: null,
    });
  });

  it("conflicten: actie", () => {
    expect(prStatus(makePr({ mergeable: "CONFLICTING" }), idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "conflicten oplossen",
      short: "conflict",
      problem: "conflict",
    });
  });

  it("gefaalde checks: actie", () => {
    const pr = makePr({
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "checks repareren",
      short: "checks",
      problem: "checks",
    });
  });

  it("changes requested: actie", () => {
    const pr = makePr({ reviewState: { state: "changesRequested" } });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "changes requested",
      short: "changes",
      problem: "changes",
    });
  });

  it("branch loopt achter (BEHIND): actie", () => {
    const pr = makePr({ mergeStateStatus: "BEHIND" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "branch loopt achter",
      short: "achter",
      problem: "achter",
    });
  });

  it("checks draaien: wachten", () => {
    const pr = makePr({ ciStatus: { state: "pending" } });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 6,
      key: "wachten",
      label: "checks draaien",
      short: "draait",
      problem: null,
    });
  });

  it("stapel geblokkeerd: wachten op de stapel", () => {
    expect(
      prStatus(makePr(), { agentBezig: false, stackBlocked: true }),
    ).toEqual({
      rank: 6,
      key: "wachten",
      label: "wacht op de stapel",
      short: "stapel",
      problem: null,
    });
  });

  it("mergeable onbekend: GitHub rekent nog, niet de stapel (B5)", () => {
    const pr = makePr({ mergeable: "UNKNOWN" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 6,
      key: "wachten",
      label: "GitHub berekent mergebaarheid",
      short: "rekent",
      problem: null,
    });
  });

  it("verplichte review ontbreekt (REVIEW_REQUIRED): wacht op review, niet klaar (B1)", () => {
    const pr = makePr({ reviewState: { state: "reviewRequested" } });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 4,
      key: "wachtReview",
      label: "wacht op review",
      short: "wacht",
      problem: null,
    });
  });

  it("BLOCKED zonder REVIEW_REQUIRED: geblokkeerd door branch protection (B1)", () => {
    const pr = makePr({ mergeStateStatus: "BLOCKED" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 4,
      key: "wachtReview",
      label: "geblokkeerd door branch protection",
      short: "blokkade",
      problem: null,
    });
  });

  it("BLOCKED plus REVIEW_REQUIRED: de ontbrekende review is de reden", () => {
    const pr = makePr({
      mergeStateStatus: "BLOCKED",
      reviewState: { state: "reviewRequested" },
    });
    expect(prStatus(pr, idleCtx).label).toBe("wacht op review");
  });

  it("alleen assignee met conflict telt als eigen PR: actie (D6)", () => {
    const pr = makePr({
      author: { kind: "human", login: "hubot" },
      authoredByMe: false,
      assignedToMe: true,
      mergeable: "CONFLICTING",
    });
    expect(prStatus(pr, idleCtx).key).toBe("actie");
  });

  it("zonder enige rol gedraagt een PR zich als eigen PR", () => {
    const pr = makePr({ authoredByMe: false, mergeable: "CONFLICTING" });
    expect(prStatus(pr, idleCtx).key).toBe("actie");
  });
});

describe("prStatus: jouw review gevraagd", () => {
  it("schone PR: jouw review nodig zonder probleem", () => {
    expect(prStatus(reviewPr(), idleCtx)).toEqual({
      rank: 2,
      key: "review",
      label: "jouw review nodig",
      short: "review",
      problem: null,
    });
  });

  it("met conflict: blijft review, toont het conflict (B2)", () => {
    const pr = reviewPr({ mergeable: "CONFLICTING" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 2,
      key: "review",
      label: "jouw review nodig · conflicten",
      short: "conflict",
      problem: "conflict",
    });
  });

  it("met rode checks: blijft review, toont de checks", () => {
    const pr = reviewPr({
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 2,
      key: "review",
      label: "jouw review nodig · checks rood",
      short: "checks",
      problem: "checks",
    });
  });

  it("met changes requested: blijft review, toont de changes", () => {
    const pr = reviewPr({ reviewState: { state: "changesRequested" } });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 2,
      key: "review",
      label: "jouw review nodig · changes requested",
      short: "changes",
      problem: "changes",
    });
  });

  it("conflict wint van rode checks als probleem", () => {
    const pr = reviewPr({
      mergeable: "CONFLICTING",
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });
    expect(prStatus(pr, idleCtx).problem).toBe("conflict");
  });

  it("wint van wachten en wacht-op-review", () => {
    const pr = reviewPr({
      ciStatus: { state: "pending" },
      reviewState: { state: "reviewRequested" },
      mergeStateStatus: "BLOCKED",
    });
    expect(prStatus(pr, { agentBezig: false, stackBlocked: true }).key).toBe(
      "review",
    );
  });
});

describe("prStatus: agent en concept gaan voor de rol", () => {
  it("agent bezig wint zelfs van een reviewverzoek", () => {
    expect(
      prStatus(reviewPr(), { agentBezig: true, stackBlocked: false }),
    ).toEqual({
      rank: 5,
      key: "agent",
      label: "agent reviewt",
      short: "agent",
      problem: null,
    });
  });

  it("agent bezig wint van concept", () => {
    const pr = makePr({ isDraft: true });
    expect(prStatus(pr, { agentBezig: true, stackBlocked: false }).key).toBe(
      "agent",
    );
  });

  it("concept wint van conflicten en van een reviewverzoek", () => {
    const pr = reviewPr({ isDraft: true, mergeable: "CONFLICTING" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 7,
      key: "concept",
      label: "concept",
      short: "concept",
      problem: null,
    });
  });
});

/**
 * Eén voorbeeld per statuskey. Het Record dwingt af dat een nieuwe key hier
 * een voorbeeld krijgt; zonder dat valt hij buiten de lengtetoets hieronder.
 */
const EEN_PER_KEY: Record<
  PrStatusKey,
  [PullRequest, { agentBezig: boolean; stackBlocked: boolean }][]
> = {
  review: [
    [reviewPr(), idleCtx],
    [reviewPr({ mergeable: "CONFLICTING" }), idleCtx],
    [
      reviewPr({ ciStatus: { state: "failure", failedChecks: ["build"] } }),
      idleCtx,
    ],
    [reviewPr({ reviewState: { state: "changesRequested" } }), idleCtx],
  ],
  klaar: [[makePr(), idleCtx]],
  actie: [
    [makePr({ mergeable: "CONFLICTING" }), idleCtx],
    [
      makePr({ ciStatus: { state: "failure", failedChecks: ["build"] } }),
      idleCtx,
    ],
    [makePr({ reviewState: { state: "changesRequested" } }), idleCtx],
    [makePr({ mergeStateStatus: "BEHIND" }), idleCtx],
  ],
  wachtReview: [
    [makePr({ reviewState: { state: "reviewRequested" } }), idleCtx],
    [makePr({ mergeStateStatus: "BLOCKED" }), idleCtx],
  ],
  agent: [[makePr(), { agentBezig: true, stackBlocked: false }]],
  wachten: [
    [makePr({ ciStatus: { state: "pending" } }), idleCtx],
    [makePr(), { agentBezig: false, stackBlocked: true }],
    [makePr({ mergeable: "UNKNOWN" }), idleCtx],
  ],
  concept: [[makePr({ isDraft: true }), idleCtx]],
};

describe("elke statuskey", () => {
  it("komt uit zijn eigen voorbeelden", () => {
    for (const [key, cases] of Object.entries(EEN_PER_KEY)) {
      for (const [pr, ctx] of cases) {
        expect(prStatus(pr, ctx).key).toBe(key);
      }
    }
  });

  it("heeft een eigen rank", () => {
    const rankPerKey = new Map<PrStatusKey, number>();
    for (const cases of Object.values(EEN_PER_KEY)) {
      for (const [pr, ctx] of cases) {
        const { key, rank } = prStatus(pr, ctx);
        rankPerKey.set(key, rank);
      }
    }
    const ranks = [...rankPerKey.values()];
    expect(ranks).toHaveLength(Object.keys(EEN_PER_KEY).length);
    expect(new Set(ranks).size).toBe(ranks.length);
  });

  it("houdt elk kort label op hoogstens acht tekens", () => {
    // Boven de acht kapt de pill af in de standaardbreedte van de kolom
    // (COLUMN_BOUNDS.status); zie de toelichting bij PrStatus.short.
    for (const cases of Object.values(EEN_PER_KEY)) {
      for (const [pr, ctx] of cases) {
        const { short } = prStatus(pr, ctx);
        expect(
          short.length,
          `"${short}" is te lang voor de statuskolom`,
        ).toBeLessThanOrEqual(8);
      }
    }
  });
});
