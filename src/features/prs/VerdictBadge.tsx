import type { AgentVerdict, PullRequest } from "../../lib/github/domain";
import "./prlist.css";

/** Verdict van de nieuwste agent-review op de PR (agents onderling op submittedAt). */
export function latestVerdict(
  pr: Pick<PullRequest, "agentReviews">,
): AgentVerdict | undefined {
  const latest = [...pr.agentReviews].sort((a, b) =>
    b.submittedAt.localeCompare(a.submittedAt),
  )[0];
  return latest?.verdict;
}

function verdictLabel(verdict: AgentVerdict): string {
  if (verdict.fixes === "geen") return "Geen fixes nodig";
  return verdict.verificatie === "lokaal"
    ? "Fixes nodig, lokaal verifiëren"
    : "Fixes nodig";
}

export function VerdictBadge({ verdict }: { verdict: AgentVerdict }) {
  return (
    <span
      className={
        verdict.fixes === "nodig"
          ? "verdict-badge verdict-badge-nodig mono"
          : "verdict-badge verdict-badge-geen mono"
      }
      title={verdictLabel(verdict)}
    >
      {verdictLabel(verdict)}
    </span>
  );
}
