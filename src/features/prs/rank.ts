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
  label: string;
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
    return { rank: 4, key: "agent", label: "agent reviewt" };
  }
  if (pr.isDraft) {
    return { rank: 6, key: "concept", label: "concept" };
  }
  if (pr.mergeable === "CONFLICTING") {
    return { rank: 3, key: "actie", label: "conflicten oplossen" };
  }
  if (pr.ciStatus.state === "failure") {
    return { rank: 3, key: "actie", label: "checks repareren" };
  }
  if (pr.reviewState.state === "changesRequested") {
    return { rank: 3, key: "actie", label: "changes requested" };
  }
  if (pr.reviewRequestedFromMe) {
    return { rank: 2, key: "review", label: "jouw review nodig" };
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
    };
  }
  return { rank: 1, key: "klaar", label: "klaar om te mergen" };
}
