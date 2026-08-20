import type { Author, PullRequest } from "../../lib/github/domain";

export type ReviewAgent = "claude" | "codex";
export type ReviewMode = "commentsOnly" | "withFixes";
export type FixMode =
  | "fixComments"
  | "fixChecks"
  | "fixConflicts"
  | "distillLearnings"
  | "distillLearningsInline";
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
 * Een geslaagde run die fixes toepaste krijgt automatisch een vervolg-run die
 * de lessen op de PR-branch zelf destilleert (distillLearningsInline); alleen
 * de handmatige actie opent een aparte lessen-PR (distillLearnings). Geen van
 * beide lessen-modes chaint zelf, dus dit loopt niet rond; fixChecks en
 * fixConflicts verwerken geen review-comments en leveren dus geen lessen op.
 */
export function chainsIntoLearnings(mode: AgentMode): boolean {
  return mode === "fixComments" || mode === "withFixes";
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
