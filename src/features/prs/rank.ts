import type { PullRequest } from "../../lib/github/domain";

export type PrStatusKey =
  | "klaar"
  | "review"
  | "actie"
  | "agent"
  | "wachten"
  | "concept";

export interface PrStatus {
  rank: 1 | 2 | 3 | 4 | 5 | 6;
  key: PrStatusKey;
  /** Volledige tekst voor het detailpaneel en tooltips. */
  label: string;
  /** Korte variant voor de pill in de lijstrij (1-2 woorden). */
  short: string;
}

/**
 * Porteert de status()/rank-functie uit het design-script 1:1: de
 * check-volgorde bepaalt welke toestand wint (bv. een lopende agent-run
 * overschaduwt zelfs een conceptstatus), de rank bepaalt de sortering.
 */
export function prStatus(
  pr: PullRequest,
  ctx: { agentBezig: boolean; stackBlocked: boolean },
): PrStatus {
  if (ctx.agentBezig) {
    return { rank: 4, key: "agent", label: "agent reviewt", short: "agent" };
  }
  if (pr.isDraft) {
    return { rank: 6, key: "concept", label: "concept", short: "concept" };
  }
  if (pr.mergeable === "CONFLICTING") {
    return {
      rank: 3,
      key: "actie",
      label: "conflicten oplossen",
      short: "conflicten",
    };
  }
  if (pr.ciStatus.state === "failure") {
    return {
      rank: 3,
      key: "actie",
      label: "checks repareren",
      short: "checks",
    };
  }
  if (pr.reviewState.state === "changesRequested") {
    return {
      rank: 3,
      key: "actie",
      label: "changes requested",
      short: "changes",
    };
  }
  if (pr.reviewRequestedFromMe) {
    return {
      rank: 2,
      key: "review",
      label: "jouw review nodig",
      short: "jouw review",
    };
  }
  if (
    pr.ciStatus.state === "pending" ||
    ctx.stackBlocked ||
    pr.mergeable === "UNKNOWN"
  ) {
    return {
      rank: 5,
      key: "wachten",
      label:
        pr.ciStatus.state === "pending"
          ? "checks draaien"
          : "wacht op de stapel",
      short: pr.ciStatus.state === "pending" ? "draait" : "stapel",
    };
  }
  return { rank: 1, key: "klaar", label: "klaar om te mergen", short: "klaar" };
}
