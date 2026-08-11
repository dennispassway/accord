import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { prStatus } from "./rank";

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

const idleCtx = { agentBezig: false, stackBlocked: false };

describe("prStatus", () => {
  it("klaar om te mergen als niets in de weg staat: rank 1", () => {
    expect(prStatus(makePr(), idleCtx)).toEqual({
      rank: 1,
      key: "klaar",
      label: "klaar om te mergen",
    });
  });

  it("jouw review nodig: rank 2", () => {
    const pr = makePr({ reviewRequestedFromMe: true });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 2,
      key: "review",
      label: "jouw review nodig",
    });
  });

  it("conflicten: rank 3 actie", () => {
    const pr = makePr({ mergeable: "CONFLICTING" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "conflicten oplossen",
    });
  });

  it("gefaalde checks: rank 3 actie", () => {
    const pr = makePr({
      ciStatus: { state: "failure", failedChecks: ["build"] },
    });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "checks repareren",
    });
  });

  it("changes requested: rank 3 actie", () => {
    const pr = makePr({ reviewState: { state: "changesRequested" } });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 3,
      key: "actie",
      label: "changes requested",
    });
  });

  it("agent bezig: rank 4, wint zelfs van changes requested", () => {
    const pr = makePr({ reviewState: { state: "changesRequested" } });
    expect(prStatus(pr, { agentBezig: true, stackBlocked: false })).toEqual({
      rank: 4,
      key: "agent",
      label: "agent reviewt",
    });
  });

  it("checks draaien: rank 5 wachten met label 'checks draaien'", () => {
    const pr = makePr({ ciStatus: { state: "pending" } });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 5,
      key: "wachten",
      label: "checks draaien",
    });
  });

  it("stapel geblokkeerd: rank 5 wachten met label 'wacht op de stapel'", () => {
    const pr = makePr();
    expect(prStatus(pr, { agentBezig: false, stackBlocked: true })).toEqual({
      rank: 5,
      key: "wachten",
      label: "wacht op de stapel",
    });
  });

  it("mergeable onbekend: rank 5 wachten", () => {
    const pr = makePr({ mergeable: "UNKNOWN" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 5,
      key: "wachten",
      label: "wacht op de stapel",
    });
  });

  it("concept: rank 6", () => {
    const pr = makePr({ isDraft: true });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 6,
      key: "concept",
      label: "concept",
    });
  });

  it("agent bezig wint van concept: rank 4", () => {
    const pr = makePr({ isDraft: true });
    expect(prStatus(pr, { agentBezig: true, stackBlocked: false })).toEqual({
      rank: 4,
      key: "agent",
      label: "agent reviewt",
    });
  });

  it("concept wint van conflicten (concept wordt eerder gecheckt)", () => {
    const pr = makePr({ isDraft: true, mergeable: "CONFLICTING" });
    expect(prStatus(pr, idleCtx)).toEqual({
      rank: 6,
      key: "concept",
      label: "concept",
    });
  });
});
