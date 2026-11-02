import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { validPrNode } from "../../lib/github/fixtures/search-response";
import { mergeReasons } from "../../lib/github/merge";
import { parseSearchResponse } from "../../lib/github/parse";
import {
  DEFAULT_HIGH_RISK_PATTERNS,
  overrideKey,
  riskGate,
} from "../../lib/risk";
import { mergeChecklist } from "./mergeChecklist";
import { prStatus } from "./rank";

const RISK_REASON = "menselijke review nodig (hoog risico)";

function makePr(overrides: Partial<PullRequest> = {}): PullRequest {
  return {
    id: "1",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(5),
    title: "Betalingen",
    url: "https://github.com/acme/widgets/pull/5",
    headRef: "feature",
    baseRef: "main",
    author: { kind: "human", login: "octocat" },
    ciStatus: { state: "success" },
    reviewState: { state: "approved" },
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
    agentReviewRounds: 1,
    agentReviews: [
      {
        agent: "claude",
        mode: "commentsOnly",
        commentCount: 0,
        commitCount: 0,
        submittedAt: "2026-01-01T00:00:00Z",
      },
    ],
    agentCommitCount: 0,
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    headOid: "abc1234",
    changedPaths: ["db/migrations/001.sql"],
    changedFileCount: 1,
    humanApprovedHead: false,
    ...overrides,
  };
}

const idle = { agentBezig: false, stackBlocked: false };

function outcome(pr: PullRequest, overrides: ReadonlySet<string> = new Set()) {
  const gate = riskGate(pr, DEFAULT_HIGH_RISK_PATTERNS, overrides);
  const status = prStatus(pr, { ...idle, risk: gate });
  const item = mergeChecklist(pr, undefined, gate).find(
    (i) => i.key === "risk",
  );
  return {
    gate,
    reason: mergeReasons(pr, undefined, gate).includes(RISK_REASON),
    blockingItem: item?.blocking === true,
    item,
    status,
  };
}

describe("risico: een bron van waarheid", () => {
  it("hoog risico zonder approval blokkeert overal", () => {
    const r = outcome(makePr());
    expect(r.gate.needsHumanReview).toBe(true);
    expect(r.reason).toBe(true);
    expect(r.blockingItem).toBe(true);
    expect(r.item?.detail).toBe("db/migrations/001.sql");
    expect(r.status.key).toBe("wachtReview");
    expect(r.status.label).toBe("menselijke review nodig");
    expect(r.status.rank).toBe(5);
  });

  it.each([
    ["menselijke approval op de head", { humanApprovedHead: true }, []],
    ["normaal risico", { changedPaths: ["a.ts"] }, []],
    ["eigen PR met override", { authoredByMe: true }, ["override"]],
  ])("%s blokkeert nergens", (_name, overrides, extra) => {
    const pr = makePr(overrides);
    const set = new Set(extra.length > 0 ? [overrideKey(pr)] : []);
    const r = outcome(pr, set);
    expect(r.gate.needsHumanReview).toBe(false);
    expect(r.reason).toBe(false);
    expect(r.blockingItem).toBe(false);
    expect(r.status.key).toBe("klaar");
    expect(mergeReasons(pr, undefined, r.gate)).toEqual([]);
  });

  it("een nieuwe commit maakt een eerdere override ongeldig", () => {
    const old = makePr({ authoredByMe: true, headOid: "old0000" });
    const set = new Set([overrideKey(old)]);
    const r = outcome(makePr({ authoredByMe: true, headOid: "new1111" }), set);
    expect(r.reason).toBe(true);
    expect(r.blockingItem).toBe(true);
    expect(r.status.key).toBe("wachtReview");
  });

  it("een agent-approval telt nooit als menselijke review", () => {
    const [parsed] = parseSearchResponse({
      nodes: [
        {
          ...validPrNode,
          headRefOid: "abc1234",
          changedFiles: 1,
          files: { nodes: [{ path: "db/migrations/001.sql" }] },
          riskApprovals: {
            nodes: [
              {
                author: { __typename: "User", login: "dennis" },
                state: "APPROVED",
                body: "<!-- accord:claude:commentsOnly fixes=geen verificatie=ci -->",
                commit: { oid: "abc1234" },
              },
            ],
          },
        },
      ],
    });
    // Verder een groene PR, zodat alleen het risico overblijft.
    const clean = {
      ...(parsed as PullRequest),
      ciStatus: { state: "success" },
      reviewState: { state: "approved" },
      mergeable: "MERGEABLE",
      mergeStateStatus: "CLEAN",
      reviewRequestedFromMe: false,
      agentReviews: makePr().agentReviews,
    } as PullRequest;
    const r = outcome(clean);
    expect(parsed?.humanApprovedHead).toBe(false);
    expect(r.reason).toBe(true);
    expect(r.status.key).toBe("wachtReview");
  });
});
