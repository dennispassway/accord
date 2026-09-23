import { MODE_LABEL } from "../prs/AgentButtons";
import type { AgentRun } from "./useAgentRuns";

const AGENT_LABEL: Record<AgentRun["agent"], string> = {
  claude: "Claude",
  codex: "Codex",
};

function plural(count: number, singular: string, pluralWord: string): string {
  return count === 1 ? `1 ${singular}` : `${count} ${pluralWord}`;
}

function elapsedMinutes(from: number, to: number): number {
  return Math.max(0, Math.round((to - from) / 60_000));
}

/** Wat er gebeurde met de commits van een afgeronde fix-run, gebaseerd op
 * `pushedCommits`/`unpushedCommits` (zie agents.rs `commit_outcome`). */
function commitOutcome(run: AgentRun): string {
  const pushed = run.pushedCommits ?? 0;
  const unpushed = run.unpushedCommits ?? 0;
  if (unpushed > 0)
    return `${plural(unpushed, "commit", "commits")} alleen lokaal`;
  if (pushed > 0) return `${plural(pushed, "commit", "commits")} gepusht`;
  return "geen wijzigingen";
}

/** D5/U3: één samenvattingsregel bovenaan het logpaneel, die per modus zegt
 * wat er is gebeurd in plaats van altijd "review"/"reviewt" te tonen. */
export function summarizeRun(run: AgentRun, now: number): string {
  const head = `${MODE_LABEL[run.mode]} · ${AGENT_LABEL[run.agent]}`;
  switch (run.status) {
    case "running":
      return `${head} · bezig sinds ${elapsedMinutes(run.startedAt, now)} min`;
    case "cancelled":
      return `${head} · geannuleerd`;
    case "failed":
      return `${head} · gefaald${run.exitCode != null ? ` (code ${run.exitCode})` : ""}`;
    case "done": {
      const minutes = elapsedMinutes(run.startedAt, run.finishedAt ?? now);
      const outcome =
        run.mode === "commentsOnly" ? "review geplaatst" : commitOutcome(run);
      return `${head} · ${minutes} min · ${outcome}`;
    }
  }
}
