import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { buildSections } from "./sort";

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

  it("prioriteit: P1 voor P2 voor geen prioriteit", () => {
    const p1 = makePr({ id: "p1", number: toPrNumber(1), priority: 1 });
    const p2 = makePr({ id: "p2", number: toPrNumber(2), priority: 2 });
    const none = makePr({ id: "none", number: toPrNumber(3), priority: null });
    const sections = buildSections([none, p2, p1], "prioriteit", idleCtx);
    expect(sections).toHaveLength(1);
    expect(sections[0]?.titel).toBe("");
    expect(sections[0]?.prs.map((pr) => pr.id)).toEqual(["p1", "p2", "none"]);
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
    expect(buildSections([], "prioriteit", idleCtx)).toEqual([]);
    expect(buildSections([], "project", idleCtx)).toEqual([]);
  });
});
