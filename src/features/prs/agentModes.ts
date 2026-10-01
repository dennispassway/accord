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

/** De andere reviewmodus, voor het menu naast de primaire reviewknop. */
export function altReviewMode(mode: ReviewMode): ReviewMode {
  return mode === "withFixes" ? "commentsOnly" : "withFixes";
}
