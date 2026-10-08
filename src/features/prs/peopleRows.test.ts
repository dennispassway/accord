import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { peopleRows } from "./peopleRows";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "PR_kwABC",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(42),
    title: "Add feature",
    url: "https://github.com/acme/widgets/pull/42",
    headRef: "feature/x",
    baseRef: "main",
    author: { kind: "human", login: "octocat" },
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
    agentCommitCount: 0,
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    ...overrides,
  };
}

describe("peopleRows", () => {
  it("voegt auteur en enige assignee samen als jij de auteur bent", () => {
    const rows = peopleRows(
      pr({ assignees: ["octocat"], authoredByMe: true }),
      "octocat",
    );
    expect(rows.author.note).toBe("jij · ook assignee");
    expect(rows.assignees).toEqual([]);
    expect(rows.mergedAssignee).toBe(true);
  });

  it("voegt samen met 'ook assignee' als iemand anders de auteur is", () => {
    const rows = peopleRows(pr({ assignees: ["octocat"] }), "hubot");
    expect(rows.author.note).toBe("ook assignee");
    expect(rows.assignees).toEqual([]);
    expect(rows.mergedAssignee).toBe(true);
  });

  it("voegt niet samen als de auteur tussen meerdere assignees staat", () => {
    const rows = peopleRows(
      pr({ assignees: ["octocat", "hubot"] }),
      "monalisa",
    );
    expect(rows.author.note).toBe("");
    expect(rows.assignees.map((a) => a.author.login)).toEqual([
      "octocat",
      "hubot",
    ]);
    expect(rows.mergedAssignee).toBe(false);
  });

  it("laat een andere assignee staan en markeert jou erin", () => {
    const rows = peopleRows(pr({ assignees: ["hubot"] }), "hubot");
    expect(rows.author.note).toBe("");
    expect(rows.assignees).toHaveLength(1);
    expect(rows.assignees[0]?.note).toBe("jij");
    expect(rows.mergedAssignee).toBe(false);
  });

  it("geeft lege assignees zonder samenvoeging als er geen assignee is", () => {
    const rows = peopleRows(pr({ authoredByMe: true }), "octocat");
    expect(rows.author.note).toBe("jij");
    expect(rows.assignees).toEqual([]);
    expect(rows.mergedAssignee).toBe(false);
  });
});
