import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import type { PrSection } from "./sort";
import { visibleSectionsFor } from "./visibleSections";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "PR_kwABC",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(42),
    title: "Add feature",
    url: "https://github.com/acme/widgets/pull/42",
    headRef: "feature/x",
    baseRef: "main",
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "success" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    mergeStateStatus: "CLEAN",
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 3,
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

describe("visibleSectionsFor", () => {
  it("houdt een ingeklapte Later-sectie met zijn eigen telling zichtbaar", () => {
    // B1: laterCollapsed is geen input van deze functie meer, juist omdat de
    // sectiekop en -telling niet van het inklappen mogen afhangen (alleen
    // toetsenbordnavigatie doet dat, elders in Cockpit.tsx).
    const later: PrSection = {
      key: "later",
      titel: "Later",
      statusKey: null,
      prs: [
        pr({ number: toPrNumber(1) }),
        pr({ number: toPrNumber(2) }),
        pr({ number: toPrNumber(3) }),
      ],
    };
    const active: PrSection = {
      key: "actie",
      titel: "Actie nodig",
      statusKey: "actie",
      prs: [pr({ number: toPrNumber(10) })],
    };
    const result = visibleSectionsFor([active, later], "");
    const laterOut = result.find((section) => section.key === "later");
    expect(laterOut?.prs.length).toBe(3);
  });

  it("filtert elke sectie op de zoekopdracht, inclusief Later", () => {
    const later: PrSection = {
      key: "later",
      titel: "Later",
      statusKey: null,
      prs: [
        pr({ number: toPrNumber(1), title: "Fix login bug" }),
        pr({ number: toPrNumber(2), title: "Add dark mode" }),
      ],
    };
    const result = visibleSectionsFor([later], "login");
    const laterOut = result.find((section) => section.key === "later");
    expect(laterOut?.prs.map((p) => p.number)).toEqual([toPrNumber(1)]);
  });

  it("laat een sectie zonder treffers helemaal weg", () => {
    const later: PrSection = {
      key: "later",
      titel: "Later",
      statusKey: null,
      prs: [pr({ number: toPrNumber(1), title: "Add dark mode" })],
    };
    const result = visibleSectionsFor([later], "geen-match");
    expect(result).toEqual([]);
  });

  it("matcht ook op repo-naam en PR-nummer (met of zonder #)", () => {
    const section: PrSection = {
      key: "actie",
      titel: "Actie nodig",
      statusKey: "actie",
      prs: [pr({ number: toPrNumber(42) })],
    };
    expect(visibleSectionsFor([section], "widgets")[0]?.prs.length).toBe(1);
    expect(visibleSectionsFor([section], "#42")[0]?.prs.length).toBe(1);
  });
});
