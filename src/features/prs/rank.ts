import type { PullRequest } from "../../lib/github/domain";

export type PrStatusKey =
  | "review"
  | "klaar"
  | "agentReview"
  | "actie"
  | "wachtReview"
  | "agent"
  | "wachten"
  | "concept";

/** Wat een PR tegenhoudt, los van de sectie waarin hij staat. */
type PrProblem = "conflict" | "checks" | "changes" | "achter";

export interface PrStatus {
  rank: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  key: PrStatusKey;
  /** Volledige tekst voor het detailpaneel en tooltips. */
  label: string;
  /**
   * Korte variant voor de pill in de statuskolom van de lijstrij. Eén woord
   * van hooguit acht tekens: dat is wat past in de standaardbreedte van die
   * kolom (COLUMN_BOUNDS.status in columnLayout.ts). Wordt hij langer, dan
   * kapt de pill af en lees je "CONFLICT..." in plaats van een status.
   */
  short: string;
  /** Het probleem dat de PR tegenhoudt; null als er niets is om te melden. */
  problem: PrProblem | null;
}

/** Conflict, rode checks of changes requested, in die volgorde. */
function blockingProblem(pr: PullRequest): Exclude<PrProblem, "achter"> | null {
  if (pr.mergeable === "CONFLICTING") return "conflict";
  if (pr.ciStatus.state === "failure") return "checks";
  if (pr.reviewState.state === "changesRequested") return "changes";
  return null;
}

const ACTIE_LABEL: Record<PrProblem, string> = {
  conflict: "conflicten oplossen",
  checks: "checks repareren",
  changes: "changes requested",
  achter: "branch loopt achter",
};

const REVIEW_PROBLEM_LABEL: Record<Exclude<PrProblem, "achter">, string> = {
  conflict: "conflicten",
  checks: "checks rood",
  changes: "changes requested",
};

/**
 * Rol eerst, toestand daarna; de eerste regel die past wint. Een lopende
 * agent-run en een concept gaan voor alles. Daarna telt of mijn review
 * gevraagd is: zo'n PR blijft in "review" staan, ook als de auteur nog een
 * probleem heeft (dat komt in `problem`). Al het andere (eigen PR, assignee
 * of geen rol) volgt de toestand van de PR zelf. De rank bepaalt de
 * sortering buiten de vaste sectievolgorde (projectmodus, omvang).
 */
export function prStatus(
  pr: PullRequest,
  ctx: { agentBezig: boolean; stackBlocked: boolean },
): PrStatus {
  if (ctx.agentBezig) {
    return {
      rank: 6,
      key: "agent",
      label: "agent reviewt",
      short: "agent",
      problem: null,
    };
  }
  if (pr.isDraft) {
    return {
      rank: 8,
      key: "concept",
      label: "concept",
      short: "concept",
      problem: null,
    };
  }
  const blocking = blockingProblem(pr);
  if (pr.reviewRequestedFromMe) {
    return {
      rank: 3,
      key: "review",
      label:
        blocking == null
          ? "jouw review nodig"
          : `jouw review nodig · ${REVIEW_PROBLEM_LABEL[blocking]}`,
      short: blocking ?? "review",
      problem: blocking,
    };
  }
  const problem =
    blocking ?? (pr.mergeStateStatus === "BEHIND" ? "achter" : null);
  if (problem != null) {
    return {
      rank: 4,
      key: "actie",
      label: ACTIE_LABEL[problem],
      short: problem,
      problem,
    };
  }
  if (pr.ciStatus.state === "pending") {
    return wachten("checks draaien", "draait");
  }
  if (ctx.stackBlocked) return wachten("wacht op de stapel", "stapel");
  if (pr.mergeable === "UNKNOWN") {
    return wachten("GitHub berekent mergebaarheid", "rekent");
  }
  if (pr.reviewState.state === "reviewRequested") {
    return {
      rank: 5,
      key: "wachtReview",
      label: "wacht op review",
      short: "wacht",
      problem: null,
    };
  }
  if (pr.mergeStateStatus === "BLOCKED") {
    return {
      rank: 5,
      key: "wachtReview",
      label: "geblokkeerd door branch protection",
      short: "blokkade",
      problem: null,
    };
  }
  // agentReviews bevat alleen agent-reviews (via login of de Accord-marker,
  // zie parseAgentReviews); een menselijke review telt hier dus niet mee.
  if (pr.agentReviews.length === 0) {
    return {
      rank: 2,
      key: "agentReview",
      label: "nog een Accord agent review",
      short: "accord",
      problem: null,
    };
  }
  return {
    rank: 1,
    key: "klaar",
    label: "klaar om te mergen",
    short: "klaar",
    problem: null,
  };
}

function wachten(label: string, short: string): PrStatus {
  return { rank: 7, key: "wachten", label, short, problem: null };
}
