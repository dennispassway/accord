import type { PullRequest } from "../../lib/github/domain";
import "./detail.css";
import { keyOfPr } from "./PrList";

interface BulkReviewButtonProps {
  prs: PullRequest[];
  onStart: (prs: PullRequest[]) => void;
  /** Label van de modus waarin de bulkrun start, bv. "alleen comments". */
  mode: string;
  /** Keys van PR's met een lopende agent-run: die tellen niet mee. */
  runningPrKeys: Set<string>;
}

/**
 * "Review alles zonder agent-review (N)": filtert zelf de PR's zonder
 * agentReviews en zonder lopende run. Verbergt zichzelf onder 2 PR's, net
 * als het design-script (hasBulk: noRun.length > 1).
 */
export function BulkReviewButton({
  prs,
  onStart,
  mode,
  runningPrKeys,
}: BulkReviewButtonProps) {
  const noRun = prs.filter(
    (pr) => pr.agentReviews.length === 0 && !runningPrKeys.has(keyOfPr(pr)),
  );

  if (noRun.length <= 1) return null;

  return (
    <button
      type="button"
      className="detail-bulk-review"
      onClick={() => onStart(noRun)}
      title={`Start ${mode} op alle ${noRun.length} PR's zonder agent-review`}
    >
      Review alles zonder agent-review ({noRun.length})
    </button>
  );
}
