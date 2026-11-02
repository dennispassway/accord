import type { PullRequest } from "../../lib/github/domain";
import type { AgentMode, ReviewAgent, ReviewMode } from "../agents/crossReview";

export const MODE_LABEL: Record<AgentMode, string> = {
  commentsOnly: "Comments",
  withFixes: "Comments + fixes",
  fixComments: "Fix bevindingen",
  fixChecks: "Fix checks",
  fixConflicts: "Los conflict op",
  distillLearnings: "Lessen vastleggen",
  distillLearningsInline: "Lessen vastleggen (in PR)",
};

/** Uitleg voor modi waarvan het label alleen niet duidelijk maakt wat er
 * gebeurt; getoond als title-tooltip in beide menu's. */
export const MODE_TITLE: Partial<Record<AgentMode, string>> = {
  distillLearnings:
    "Destilleert de lessen uit de review-comments en fixes naar CLAUDE.md of een skill, via een eigen PR",
  distillLearningsInline:
    "Destilleert de lessen uit de review-comments en fixes naar CLAUDE.md of een skill, als commit op de PR-branch zelf",
};

export const AGENT_LABEL: Record<ReviewAgent, string> = {
  claude: "Claude",
  codex: "Codex",
};

export function otherAgent(agent: ReviewAgent): ReviewAgent {
  return agent === "claude" ? "codex" : "claude";
}

/** Vanaf deze ronde geeft withFixes alleen advies (src-tauri/src/agents.rs, ADVICE_ROUND). */
export const ADVICE_ROUND = 3;

/** De ronde die een nieuwe review-run op deze PR wordt. */
export function nextReviewRound(
  pr: Pick<PullRequest, "agentReviewRounds">,
): number {
  return pr.agentReviewRounds + 1;
}

/** Geeft een review in deze modus alleen advies in plaats van fixes te pushen? */
export function isAdviceRound(
  pr: Pick<PullRequest, "agentReviewRounds">,
  mode: AgentMode,
): boolean {
  return mode === "withFixes" && nextReviewRound(pr) >= ADVICE_ROUND;
}

/** Heeft de volgende review al minstens één voorganger, dan krijgt hij een ronde-label. */
export function showsRound(
  pr: Pick<PullRequest, "agentReviewRounds">,
): boolean {
  return pr.agentReviewRounds > 0;
}

export const ADVICE_TITLE =
  "Na twee rondes geeft de agent alleen advies en pusht hij niets. Forceer een extra ronde om toch te laten fixen.";

/** De andere reviewmodus, voor het menu naast de primaire reviewknop. */
export function altReviewMode(mode: ReviewMode): ReviewMode {
  return mode === "withFixes" ? "commentsOnly" : "withFixes";
}
