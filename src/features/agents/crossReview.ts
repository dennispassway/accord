import type { Author, PullRequest } from "../../lib/github/domain";

export type ReviewAgent = "claude" | "codex";
export type ReviewMode = "commentsOnly" | "withFixes";
export type FixMode =
  | "fixComments"
  | "fixChecks"
  | "fixConflicts"
  | "distillLearnings";
export type AgentMode = ReviewMode | FixMode;

/**
 * Kruisreview: de agent die de PR schreef reviewt hem niet zelf. Bij een
 * menselijke auteur is Claude de standaard.
 */
export function preferredReviewer(author: Author): ReviewAgent {
  if (author.kind === "agent") {
    return author.agent === "claude" ? "codex" : "claude";
  }
  return "claude";
}

/**
 * Fix-acties die op deze PR van toepassing zijn, blokkerend eerst: een
 * mergeconflict of falende check houdt de PR tegen, openstaande comments niet.
 */
export function availableFixModes(pr: PullRequest): FixMode[] {
  const modes: FixMode[] = [];
  if (pr.mergeable === "CONFLICTING") modes.push("fixConflicts");
  if (pr.ciStatus.state === "failure") modes.push("fixChecks");
  if (pr.comments > 0) modes.push("fixComments", "distillLearnings");
  return modes;
}
