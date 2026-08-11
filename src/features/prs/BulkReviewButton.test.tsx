import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { BulkReviewButton } from "./BulkReviewButton";

function pr(number: number): PullRequest {
  return {
    id: `id-${number}`,
    repoId: toRepoId("acme/widgets"),
    title: `PR ${number}`,
    url: `https://github.com/acme/widgets/pull/${number}`,
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "none" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    priority: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 0,
    deletions: 0,
    comments: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    baseRef: "main",
    headRef: `feature-${number}`,
    number: toPrNumber(number),
  };
}

/**
 * Reproduceert B4: de teller/startset moet exact de doorgegeven (zichtbare,
 * gefilterde) lijst zijn. Cockpit.tsx gaf hier per abuis de pre-zoekfilter
 * lijst door (7 PR's) terwijl er maar 2 zichtbaar waren; deze test legt vast
 * dat de knop telt wat hij krijgt, zodat de caller (Cockpit) verplicht is de
 * gefilterde lijst door te geven.
 */
describe("BulkReviewButton", () => {
  it("telt exact de doorgegeven PR's, niet een grotere achterliggende lijst", () => {
    const sevenPrs = Array.from({ length: 7 }, (_, i) => pr(i + 1));
    const twoFilteredPrs = [
      sevenPrs[0] as PullRequest,
      sevenPrs[1] as PullRequest,
    ];

    const withSeven = renderToStaticMarkup(
      <BulkReviewButton
        prs={sevenPrs}
        onStart={() => {}}
        mode="alleen comments"
        runningPrKeys={new Set()}
      />,
    );
    const withFiltered = renderToStaticMarkup(
      <BulkReviewButton
        prs={twoFilteredPrs}
        onStart={() => {}}
        mode="alleen comments"
        runningPrKeys={new Set()}
      />,
    );

    expect(withSeven).toContain("(7)");
    expect(withFiltered).toContain("(2)");
    expect(withFiltered).not.toContain("(7)");
  });
});
