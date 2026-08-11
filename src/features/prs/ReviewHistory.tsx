import type { AgentReview, PullRequest } from "../../lib/github/domain";
import { avatarBg } from "./Avatar";
import { formatRelative } from "./format";
import { AgentIcon } from "./icons";
import "./reviewhistory.css";

const AGENT_NAME: Record<AgentReview["agent"], string> = {
  claude: "Claude",
  codex: "Codex",
};

const MODE_LABEL: Record<AgentReview["mode"], string> = {
  commentsOnly: "alleen comments",
  commentsAndFixes: "comments + fixes",
};

function reviewDetail(review: AgentReview): string {
  const commentLabel = review.commentCount === 1 ? "opmerking" : "opmerkingen";
  const parts = [`${review.commentCount} ${commentLabel}`];
  if (review.commitCount > 0) {
    const commitLabel = review.commitCount === 1 ? "commit" : "commits";
    parts.push(`${review.commitCount} ${commitLabel} gepusht`);
  }
  return `${MODE_LABEL[review.mode]} · ${parts.join(", ")} · ${formatRelative(review.submittedAt)} geleden`;
}

interface ReviewHistoryProps {
  pr: PullRequest;
}

/**
 * Uitgeschreven reviewhistorie onder "Laten reviewen": "Claude · alleen
 * comments · 4 opmerkingen · 2 u geleden". De duur van de run is op
 * GitHub-data niet betrouwbaar, dus toont in plaats daarvan de relatieve
 * tijd van de review zelf. Meest recente review bovenaan.
 */
export function ReviewHistory({ pr }: ReviewHistoryProps) {
  if (pr.agentReviews.length === 0) return null;

  const sorted = [...pr.agentReviews].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  );

  return (
    <div className="review-history">
      {sorted.map((review) => (
        <div key={review.agent} className="review-history-row">
          <span
            className="review-history-icon"
            style={{ background: avatarBg(review.agent) }}
          >
            <AgentIcon size={10} />
          </span>
          <span className="review-history-name">
            {AGENT_NAME[review.agent]}
          </span>
          <span className="review-history-detail mono">
            {reviewDetail(review)}
          </span>
        </div>
      ))}
    </div>
  );
}
