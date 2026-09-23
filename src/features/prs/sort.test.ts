import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import type { PrStatusKey } from "./rank";
import { buildSections, type SortCtx } from "./sort";

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
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    ...overrides,
  };
}

const idleCtx = {
  isAgentBezig: () => false,
  isStackBlocked: () => false,
};

describe("buildSections", () => {
  it("triage: secties in status-rank volgorde, lege secties vervallen", () => {
    const klaar = makePr({ id: "klaar", number: toPrNumber(1) });
    const review = makePr({
      id: "review",
      number: toPrNumber(2),
      reviewRequestedFromMe: true,
    });
    const actie = makePr({
      id: "actie",
      number: toPrNumber(3),
      reviewState: { state: "changesRequested" },
    });
    const concept = makePr({
      id: "concept",
      number: toPrNumber(4),
      isDraft: true,
    });

    const sections = buildSections(
      [klaar, review, actie, concept],
      "triage",
      idleCtx,
    );

    expect(sections.map((s) => s.titel)).toEqual([
      "Jouw review nodig",
      "Klaar om te mergen",
      "Actie nodig",
      "Concept",
    ]);
    expect(sections.map((s) => s.prs.map((pr) => pr.id))).toEqual([
      ["review"],
      ["klaar"],
      ["actie"],
      ["concept"],
    ]);
    expect(sections.map((s) => s.statusKey)).toEqual([
      "review",
      "klaar",
      "actie",
      "concept",
    ]);
  });

  it("triage: agent bezig sectie tussen actie en wachten", () => {
    const agentPr = makePr({ id: "agent", number: toPrNumber(1) });
    const wachtPr = makePr({
      id: "wacht",
      number: toPrNumber(2),
      ciStatus: { state: "pending" },
    });
    const ctx = {
      isAgentBezig: (pr: PullRequest) => pr.id === "agent",
      isStackBlocked: () => false,
    };
    const sections = buildSections([agentPr, wachtPr], "triage", ctx);
    expect(sections.map((s) => s.titel)).toEqual(["Agent bezig", "Wachten"]);
  });

  it("triage: volledige sectievolgorde, elke statuskey een eigen sectie", () => {
    // Record: een nieuwe PrStatusKey zonder voorbeeld is een typefout, dus
    // een key zonder sectie (PR's die stil verdwijnen) valt hier op.
    const voorbeeld: Record<PrStatusKey, Partial<PullRequest>> = {
      review: { reviewRequestedFromMe: true },
      klaar: {},
      actie: { mergeable: "CONFLICTING" },
      wachtReview: { reviewState: { state: "reviewRequested" } },
      agent: {},
      wachten: { ciStatus: { state: "pending" } },
      concept: { isDraft: true },
    };
    const prs = Object.entries(voorbeeld).map(([key, overrides], index) =>
      makePr({ id: key, number: toPrNumber(index + 1), ...overrides }),
    );
    const ctx: SortCtx = {
      isAgentBezig: (pr) => pr.id === "agent",
      isStackBlocked: () => false,
    };

    const sections = buildSections(prs, "triage", ctx);

    expect(sections.map((s) => s.key)).toEqual([
      "review",
      "klaar",
      "actie",
      "wachtReview",
      "agent",
      "wachten",
      "concept",
    ]);
    expect(sections.map((s) => s.titel)).toEqual([
      "Jouw review nodig",
      "Klaar om te mergen",
      "Actie nodig",
      "Wacht op review",
      "Agent bezig",
      "Wachten",
      "Concept",
    ]);
    for (const section of sections) {
      expect(section.statusKey).toBe(section.key);
      expect(section.prs.map((pr) => pr.id)).toEqual([section.key]);
    }
  });

  it("triage: in jouw review nodig eerst de schone PR's, dan die met een probleem (D7)", () => {
    const oudSchoon = makePr({
      id: "oudSchoon",
      number: toPrNumber(1),
      reviewRequestedFromMe: true,
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const nieuwConflict = makePr({
      id: "nieuwConflict",
      number: toPrNumber(2),
      reviewRequestedFromMe: true,
      mergeable: "CONFLICTING",
      updatedAt: "2026-01-05T00:00:00Z",
    });
    const nieuwSchoon = makePr({
      id: "nieuwSchoon",
      number: toPrNumber(3),
      reviewRequestedFromMe: true,
      updatedAt: "2026-01-03T00:00:00Z",
    });
    const oudChecks = makePr({
      id: "oudChecks",
      number: toPrNumber(4),
      reviewRequestedFromMe: true,
      ciStatus: { state: "failure", failedChecks: ["build"] },
      updatedAt: "2026-01-02T00:00:00Z",
    });

    const [review] = buildSections(
      [oudSchoon, nieuwConflict, nieuwSchoon, oudChecks],
      "triage",
      idleCtx,
    );

    expect(review?.key).toBe("review");
    expect(review?.prs.map((pr) => pr.id)).toEqual([
      "nieuwSchoon",
      "oudSchoon",
      "nieuwConflict",
      "oudChecks",
    ]);
  });

  it("bijgewerkt: meest recent bijgewerkt eerst", () => {
    const oud = makePr({
      id: "oud",
      number: toPrNumber(1),
      updatedAt: "2026-01-01T00:00:00Z",
    });
    const nieuw = makePr({
      id: "nieuw",
      number: toPrNumber(2),
      updatedAt: "2026-01-03T00:00:00Z",
    });
    const sections = buildSections([oud, nieuw], "bijgewerkt", idleCtx);
    expect(sections[0]?.prs.map((pr) => pr.id)).toEqual(["nieuw", "oud"]);
  });

  it("oudste: aanmaakdatum oudste eerst", () => {
    const oud = makePr({
      id: "oud",
      number: toPrNumber(1),
      createdAt: "2026-01-01T00:00:00Z",
    });
    const nieuw = makePr({
      id: "nieuw",
      number: toPrNumber(2),
      createdAt: "2026-01-03T00:00:00Z",
    });
    const sections = buildSections([nieuw, oud], "oudste", idleCtx);
    expect(sections[0]?.prs.map((pr) => pr.id)).toEqual(["oud", "nieuw"]);
  });

  it("omvang: kleinste diff eerst (snelste eerst)", () => {
    const groot = makePr({
      id: "groot",
      number: toPrNumber(1),
      additions: 400,
      deletions: 100,
    });
    const klein = makePr({
      id: "klein",
      number: toPrNumber(2),
      additions: 5,
      deletions: 2,
    });
    const sections = buildSections([groot, klein], "omvang", idleCtx);
    expect(sections[0]?.prs.map((pr) => pr.id)).toEqual(["klein", "groot"]);
  });

  it("project: sectie per repo, beste (laagste rank-nummer) repo eerst", () => {
    // rank 1 (klaar om te mergen) is lager dan rank 3 (actie nodig), dus
    // acme/aaa wint de groupKey-vergelijking (Math.min over de rijen).
    const repoA1 = makePr({
      id: "a1",
      number: toPrNumber(1),
      repoId: toRepoId("acme/aaa"),
    });
    const repoB1 = makePr({
      id: "b1",
      number: toPrNumber(1),
      repoId: toRepoId("acme/bbb"),
      reviewState: { state: "changesRequested" },
    });
    const sections = buildSections([repoA1, repoB1], "project", idleCtx);
    expect(sections.map((s) => s.key)).toEqual(["acme/aaa", "acme/bbb"]);
    expect(sections.map((s) => s.titel)).toEqual(["acme/aaa", "acme/bbb"]);
    expect(sections.map((s) => s.statusKey)).toEqual(["klaar", "actie"]);
  });

  it("lege lijst geeft lege secties", () => {
    expect(buildSections([], "triage", idleCtx)).toEqual([]);
    expect(buildSections([], "project", idleCtx)).toEqual([]);
  });

  it("haalt gesnoozede PR's uit hun sectie en zet ze in Later, op until oplopend", () => {
    const klaar = makePr({ id: "klaar", number: toPrNumber(1) });
    const snoozedVroeg = makePr({ id: "snoozedVroeg", number: toPrNumber(2) });
    const snoozedLaat = makePr({
      id: "snoozedLaat",
      number: toPrNumber(3),
      reviewRequestedFromMe: true,
    });
    const until: Record<string, string> = {
      snoozedVroeg: "2026-08-02T07:00:00.000Z",
      snoozedLaat: "2026-08-10T07:00:00.000Z",
    };

    const sections = buildSections(
      [klaar, snoozedVroeg, snoozedLaat],
      "triage",
      idleCtx,
      (pr) => until[pr.id],
    );

    const later = sections.find((s) => s.key === "later");
    expect(later?.titel).toBe("Later");
    expect(later?.statusKey).toBeNull();
    expect(later?.prs.map((pr) => pr.id)).toEqual([
      "snoozedVroeg",
      "snoozedLaat",
    ]);
    const klaarSection = sections.find((s) => s.key === "klaar");
    expect(klaarSection?.prs.map((pr) => pr.id)).toEqual(["klaar"]);
    // Later staat als laatste sectie.
    expect(sections[sections.length - 1]?.key).toBe("later");
  });

  it("project-modus: Later blijft één sectie over de repo's heen", () => {
    const repoA = makePr({
      id: "a",
      number: toPrNumber(1),
      repoId: toRepoId("acme/aaa"),
    });
    const snoozed = makePr({
      id: "snoozed",
      number: toPrNumber(2),
      repoId: toRepoId("acme/bbb"),
    });
    const sections = buildSections(
      [repoA, snoozed],
      "project",
      idleCtx,
      (pr) => (pr.id === "snoozed" ? "2026-08-02T07:00:00.000Z" : undefined),
    );
    expect(sections.map((s) => s.key)).toEqual(["acme/aaa", "later"]);
    expect(
      sections.find((s) => s.key === "later")?.prs.map((pr) => pr.id),
    ).toEqual(["snoozed"]);
  });
});
