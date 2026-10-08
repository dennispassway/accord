import type { AgentReview, Author, PullRequest } from "../../lib/github/domain";

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
 * Kruiswerk in de andere richting: wie het laatst reviewde fixt niet zijn
 * eigen bevindingen. Zonder agent-review geldt de tegenhanger van de
 * standaardreviewer, zodat review en fix ook dan bij twee agents liggen.
 */
export function preferredFixer(pr: PullRequest): ReviewAgent {
  const latest = pr.agentReviews.reduce<AgentReview | undefined>(
    (best, review) =>
      best == null || review.submittedAt > best.submittedAt ? review : best,
    undefined,
  );
  const reviewer = latest?.agent ?? preferredReviewer(pr.author);
  return reviewer === "claude" ? "codex" : "claude";
}

/**
 * De fixer die ook echt kan draaien: de voorkeur, anders de andere agent als
 * alleen díe CLI bestaat. Null als geen CLI beschikbaar is of de lokale map
 * ontbreekt (dezelfde voorwaarden als `disabledReason` in DetailPanel).
 */
export function availableFixer(
  pr: PullRequest,
  clis: Record<ReviewAgent, boolean>,
  repoPath: string | undefined,
): ReviewAgent | null {
  if (repoPath == null || repoPath === "") return null;
  const preferred = preferredFixer(pr);
  const other = preferred === "claude" ? "codex" : "claude";
  if (clis[preferred]) return preferred;
  return clis[other] ? other : null;
}

/**
 * Lessen destilleren na een merge, en alleen als er iets te leren valt: een
 * review-comment (mens of agent) of een fix-commit van een agent. Niet als er
 * voor deze PR al een distill-run actief of geslaagd is.
 */
export function shouldDistillAfterMerge(
  pr: PullRequest,
  autoDistillLearnings: boolean,
  hasDistillRun = false,
): boolean {
  if (!autoDistillLearnings || hasDistillRun) return false;
  return (
    pr.comments > 0 ||
    pr.agentCommitCount > 0 ||
    pr.agentReviews.some((r) => r.commentCount > 0)
  );
}

/**
 * Fix-acties die op deze PR van toepassing zijn, blokkerend eerst: een
 * mergeconflict of falende check houdt de PR tegen, openstaande comments niet.
 */
export function availableFixModes(pr: PullRequest): FixMode[] {
  const modes: FixMode[] = [];
  if (pr.mergeable === "CONFLICTING") modes.push("fixConflicts");
  if (pr.ciStatus.state === "failure") modes.push("fixChecks");
  // Opgeloste threads vragen geen fix meer, maar leveren nog wel lessen op.
  if (pr.openThreads > 0) modes.push("fixComments");
  if (pr.comments > 0) modes.push("distillLearnings");
  return modes;
}
