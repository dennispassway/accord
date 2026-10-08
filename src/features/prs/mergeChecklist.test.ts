import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { mergeReasons } from "../../lib/github/merge";
import type { PrStackInfo } from "../../lib/github/stacks";
import { type ChecklistKey, mergeChecklist } from "./mergeChecklist";

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
    reviewState: { state: "approved" },
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
    authoredByMe: true,
    ...overrides,
  };
}

function stackInfo(overrides: Partial<PrStackInfo> = {}): PrStackInfo {
  return {
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(42),
    stackPosition: 1,
    stackSize: 1,
    blockedByPrNumbers: [],
    ...overrides,
  };
}

function item(
  p: PullRequest,
  key: ChecklistKey,
  info: PrStackInfo | undefined = undefined,
) {
  return mergeChecklist(p, info).find((i) => i.key === key);
}

describe("mergeChecklist: volgorde en altijd-aanwezige regels", () => {
  it("toont bij een groene PR alleen conflict, checks en review", () => {
    expect(mergeChecklist(pr(), undefined).map((i) => i.key)).toEqual([
      "conflict",
      "checks",
      "review",
    ]);
  });

  it("houdt de volgorde aan als alles speelt", () => {
    const all = pr({
      mergeable: "CONFLICTING",
      ciStatus: { state: "failure", failedChecks: ["build"] },
      openThreads: 2,
      reviewState: { state: "changesRequested" },
      isDraft: true,
      mergeStateStatus: "BEHIND",
    });
    const keys = mergeChecklist(
      all,
      stackInfo({ blockedByPrNumbers: [toPrNumber(1)] }),
    ).map((i) => i.key);
    expect(keys).toEqual([
      "conflict",
      "checks",
      "threads",
      "review",
      "draft",
      "behind",
      "stack",
    ]);
  });
});

describe("mergeChecklist: conflict", () => {
  it("MERGEABLE is ok", () => {
    expect(item(pr(), "conflict")).toEqual({
      key: "conflict",
      tone: "ok",
      label: "Geen conflicten met main",
      blocking: false,
    });
  });

  it("CONFLICTING is err met fixConflicts", () => {
    expect(item(pr({ mergeable: "CONFLICTING" }), "conflict")).toEqual({
      key: "conflict",
      tone: "err",
      label: "Conflict met main",
      fix: "fixConflicts",
      blocking: true,
    });
  });

  it("UNKNOWN is warn en blokkeert", () => {
    expect(item(pr({ mergeable: "UNKNOWN" }), "conflict")).toEqual({
      key: "conflict",
      tone: "warn",
      label: "Mergebaarheid onbekend",
      blocking: true,
    });
  });
});

describe("mergeChecklist: checks", () => {
  it("success is ok", () => {
    expect(item(pr(), "checks")).toEqual({
      key: "checks",
      tone: "ok",
      label: "Alle checks geslaagd",
      blocking: false,
    });
  });

  it("failure met één check noemt enkelvoud en de naam", () => {
    expect(
      item(
        pr({ ciStatus: { state: "failure", failedChecks: ["build"] } }),
        "checks",
      ),
    ).toEqual({
      key: "checks",
      tone: "err",
      label: "1 check gefaald",
      detail: "build",
      fix: "fixChecks",
      blocking: true,
    });
  });

  it("failure met twee checks noemt meervoud en beide namen", () => {
    const c = item(
      pr({ ciStatus: { state: "failure", failedChecks: ["build", "lint"] } }),
      "checks",
    );
    expect(c?.label).toBe("2 checks gefaald");
    expect(c?.detail).toBe("build, lint");
  });

  it("pending is warn en blokkeert", () => {
    expect(item(pr({ ciStatus: { state: "pending" } }), "checks")).toEqual({
      key: "checks",
      tone: "warn",
      label: "Checks draaien",
      blocking: true,
    });
  });

  it("none is neutraal en blokkeert niet", () => {
    expect(item(pr({ ciStatus: { state: "none" } }), "checks")).toEqual({
      key: "checks",
      tone: "none",
      label: "Geen checks ingesteld",
      blocking: false,
    });
  });
});

describe("mergeChecklist: threads", () => {
  it("ontbreekt zonder open threads", () => {
    expect(item(pr(), "threads")).toBeUndefined();
  });

  it("één open thread: enkelvoud, warn, fixComments, niet blocking", () => {
    expect(item(pr({ openThreads: 1 }), "threads")).toEqual({
      key: "threads",
      tone: "warn",
      label: "1 open thread",
      fix: "fixComments",
      blocking: false,
    });
  });

  it("drie open threads: meervoud", () => {
    expect(item(pr({ openThreads: 3 }), "threads")?.label).toBe(
      "3 open threads",
    );
  });
});

describe("mergeChecklist: review", () => {
  it("approved is ok", () => {
    expect(item(pr(), "review")).toEqual({
      key: "review",
      tone: "ok",
      label: "Goedgekeurd",
      blocking: false,
    });
  });

  it("changesRequested is err en blokkeert", () => {
    expect(
      item(pr({ reviewState: { state: "changesRequested" } }), "review"),
    ).toEqual({
      key: "review",
      tone: "err",
      label: "Changes requested",
      blocking: true,
    });
  });

  it("reviewRequested van mij op andermans PR krijgt de hint", () => {
    expect(
      item(
        pr({
          reviewState: { state: "reviewRequested" },
          reviewRequestedFromMe: true,
          authoredByMe: false,
        }),
        "review",
      ),
    ).toEqual({
      key: "review",
      tone: "warn",
      label: "Jouw review is gevraagd",
      detail: "Goedkeuren en changes vragen staan onderaan",
      blocking: true,
    });
  });

  it("reviewRequested zonder mij als reviewer is generiek", () => {
    expect(
      item(pr({ reviewState: { state: "reviewRequested" } }), "review"),
    ).toEqual({
      key: "review",
      tone: "warn",
      label: "Review gevraagd",
      blocking: true,
    });
  });

  it("reviewRequested van mij op mijn eigen PR is generiek", () => {
    const r = item(
      pr({
        reviewState: { state: "reviewRequested" },
        reviewRequestedFromMe: true,
        authoredByMe: true,
      }),
      "review",
    );
    expect(r?.label).toBe("Review gevraagd");
    expect(r?.detail).toBeUndefined();
  });

  it("none is neutraal en blokkeert niet", () => {
    expect(item(pr({ reviewState: { state: "none" } }), "review")).toEqual({
      key: "review",
      tone: "none",
      label: "Geen review gevraagd",
      blocking: false,
    });
  });
});

describe("mergeChecklist: draft, behind, protection, stack", () => {
  it("draft", () => {
    expect(item(pr({ isDraft: true }), "draft")).toEqual({
      key: "draft",
      tone: "warn",
      label: "Concept",
      blocking: true,
    });
  });

  it("behind", () => {
    expect(item(pr({ mergeStateStatus: "BEHIND" }), "behind")).toEqual({
      key: "behind",
      tone: "warn",
      label: "Loopt achter op main",
      blocking: true,
    });
  });

  it("protection bij BLOCKED zonder andere verklaring", () => {
    expect(item(pr({ mergeStateStatus: "BLOCKED" }), "protection")).toEqual({
      key: "protection",
      tone: "warn",
      label: "Geblokkeerd door branch protection",
      blocking: true,
    });
  });

  it("protection ontbreekt als BLOCKED door rode CI verklaard wordt", () => {
    expect(
      item(
        pr({
          mergeStateStatus: "BLOCKED",
          ciStatus: { state: "failure", failedChecks: ["build"] },
        }),
        "protection",
      ),
    ).toBeUndefined();
  });

  it("stack noemt de blokkerende PR's", () => {
    expect(
      item(
        pr(),
        "stack",
        stackInfo({ blockedByPrNumbers: [toPrNumber(1), toPrNumber(2)] }),
      ),
    ).toEqual({
      key: "stack",
      tone: "warn",
      label: "Eerst #1, #2 mergen",
      blocking: true,
    });
  });

  it("stack ontbreekt zonder blokkerende PR's of zonder stackinfo", () => {
    expect(item(pr(), "stack", stackInfo())).toBeUndefined();
    expect(item(pr(), "stack", undefined)).toBeUndefined();
  });
});

describe("mergeChecklist: invariant met mergeReasons", () => {
  const blockedBy = stackInfo({
    blockedByPrNumbers: [toPrNumber(7), toPrNumber(8)],
  });
  const failing: PullRequest["ciStatus"] = {
    state: "failure",
    failedChecks: ["build", "lint"],
  };

  const cases: Array<
    [string, PullRequest, PrStackInfo | undefined, ChecklistKey[]]
  > = [
    ["alles groen", pr(), stackInfo(), []],
    ["alles groen zonder stackinfo", pr(), undefined, []],
    ["alleen open threads", pr({ openThreads: 4 }), stackInfo(), []],
    ["conflict", pr({ mergeable: "CONFLICTING" }), undefined, ["conflict"]],
    [
      "mergebaarheid onbekend",
      pr({ mergeable: "UNKNOWN" }),
      undefined,
      ["conflict"],
    ],
    ["draft", pr({ isDraft: true }), undefined, ["draft"]],
    ["rode CI", pr({ ciStatus: failing }), undefined, ["checks"]],
    [
      "CI draait",
      pr({ ciStatus: { state: "pending" } }),
      undefined,
      ["checks"],
    ],
    [
      "changes requested",
      pr({ reviewState: { state: "changesRequested" } }),
      undefined,
      ["review"],
    ],
    [
      "review gevraagd",
      pr({ reviewState: { state: "reviewRequested" } }),
      undefined,
      ["review"],
    ],
    [
      "achter op base",
      pr({ mergeStateStatus: "BEHIND" }),
      undefined,
      ["behind"],
    ],
    [
      "branch protection",
      pr({ mergeStateStatus: "BLOCKED" }),
      undefined,
      ["protection"],
    ],
    ["gestapeld", pr(), blockedBy, ["stack"]],
    [
      "BLOCKED verklaard door rode CI",
      pr({ mergeStateStatus: "BLOCKED", ciStatus: failing }),
      undefined,
      ["checks"],
    ],
    [
      "BLOCKED verklaard door gevraagde review",
      pr({
        mergeStateStatus: "BLOCKED",
        reviewState: { state: "reviewRequested" },
      }),
      undefined,
      ["review"],
    ],
    [
      "BLOCKED verklaard door conflict",
      pr({ mergeStateStatus: "BLOCKED", mergeable: "CONFLICTING" }),
      undefined,
      ["conflict"],
    ],
    [
      "combinatie: draft, achter, stack, threads (BEHIND is geen BLOCKED)",
      pr({
        isDraft: true,
        mergeStateStatus: "BEHIND",
        openThreads: 2,
      }),
      blockedBy,
      ["draft", "behind", "stack"],
    ],
    [
      "combinatie: BLOCKED, draft, stack (protection telt mee)",
      pr({ isDraft: true, mergeStateStatus: "BLOCKED" }),
      blockedBy,
      ["draft", "protection", "stack"],
    ],
    [
      "combinatie: alles tegelijk",
      pr({
        mergeable: "CONFLICTING",
        isDraft: true,
        ciStatus: failing,
        reviewState: { state: "changesRequested" },
        mergeStateStatus: "BLOCKED",
        openThreads: 1,
      }),
      blockedBy,
      ["conflict", "checks", "review", "draft", "stack"],
    ],
  ];

  it.each(cases)("%s", (_naam, p, info, expectedKeys) => {
    const blocking = mergeChecklist(p, info).filter((i) => i.blocking);
    expect(blocking).toHaveLength(mergeReasons(p, info).length);
    expect(blocking.map((i) => i.key).sort()).toEqual([...expectedKeys].sort());
  });
});
