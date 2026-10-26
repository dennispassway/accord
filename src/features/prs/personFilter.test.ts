import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import {
  matchesPerson,
  PERSON_ROLES,
  type PersonFilter,
  type PersonRole,
  peopleFor,
} from "./personFilter";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "1",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(1),
    title: "Some PR",
    url: "https://github.com/acme/widgets/pull/1",
    headRef: "feature",
    baseRef: "main",
    author: { kind: "human", login: "anna" },
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

// Eén PR waarin elke rol door een andere persoon gevuld wordt, zodat een
// matcher die de verkeerde rol leest op de verkeerde login matcht.
const pr = makePr({
  author: { kind: "human", login: "anna" },
  assignees: ["bram"],
  reviewers: [{ login: "carla", state: "pending" }],
});
const loginFor: Record<PersonRole, string> = {
  author: "anna",
  assignee: "bram",
  reviewer: "carla",
};

describe("matchesPerson", () => {
  it("laat alles door zonder gekozen persoon", () => {
    for (const role of PERSON_ROLES) {
      expect(matchesPerson(pr, { role, login: null }, "me")).toBe(true);
    }
  });

  it("matcht per rol alleen de persoon in die rol", () => {
    for (const role of PERSON_ROLES) {
      for (const other of PERSON_ROLES) {
        const filter: PersonFilter = { role, login: loginFor[other] };
        expect(matchesPerson(pr, filter, "me")).toBe(role === other);
      }
    }
  });

  it("telt een reviewer met een oordeel ook als reviewer", () => {
    const reviewed = makePr({
      reviewers: [{ login: "carla", state: "approved" }],
    });
    expect(
      matchesPerson(reviewed, { role: "reviewer", login: "carla" }, "me"),
    ).toBe(true);
  });
});

describe("matchesPerson voor mij", () => {
  // GitHub-zoektermen als review-requested:@me tellen ook verzoeken aan een
  // team van mij mee; die staan niet in `reviewers` (de query leest alleen
  // users), wel in de vlag. Per rol: alleen de vlag gezet, niets in de lijsten.
  const flagFor: Record<PersonRole, Partial<PullRequest>> = {
    author: { authoredByMe: true },
    assignee: { assignedToMe: true },
    reviewer: { reviewRequestedFromMe: true },
  };

  it("matcht mij in een rol via de vlag, en alleen in die rol", () => {
    for (const role of PERSON_ROLES) {
      const flagged = makePr(flagFor[role]);
      for (const other of PERSON_ROLES) {
        const filter: PersonFilter = { role: other, login: "me" };
        expect(matchesPerson(flagged, filter, "me")).toBe(role === other);
      }
    }
  });

  it("telt mij via de vlag mee in peopleFor", () => {
    const prs = PERSON_ROLES.map((role) => makePr(flagFor[role]));
    for (const role of PERSON_ROLES) {
      expect(peopleFor(prs, role, "me", null)[0]).toEqual({
        login: "me",
        count: 1,
      });
    }
  });
});

describe("peopleFor", () => {
  const prs = [
    makePr({ author: { kind: "human", login: "bram" } }),
    makePr({ author: { kind: "human", login: "anna" } }),
    makePr({ author: { kind: "human", login: "Carla" }, assignees: ["dirk"] }),
    makePr({ author: { kind: "human", login: "bram" } }),
  ];

  it("zet mij bovenaan, ook als ik in geen enkele PR die rol heb", () => {
    expect(peopleFor(prs, "author", "me", null)[0]).toEqual({
      login: "me",
      count: 0,
    });
  });

  it("geeft de rest uniek en alfabetisch, met het aantal PR's", () => {
    expect(peopleFor(prs, "author", "me", null).slice(1)).toEqual([
      { login: "anna", count: 1 },
      { login: "bram", count: 2 },
      { login: "Carla", count: 1 },
    ]);
  });

  it("leest alleen de gekozen rol", () => {
    expect(peopleFor(prs, "assignee", "me", null).slice(1)).toEqual([
      { login: "dirk", count: 1 },
    ]);
  });

  it("houdt de gekozen persoon in de lijst als hij uit de PR's verdwijnt", () => {
    expect(
      peopleFor(prs, "assignee", "me", "eva").map((person) => person.login),
    ).toEqual(["me", "dirk", "eva"]);
  });
});
