import type { AgentRun } from "./useAgentRuns";

/**
 * Runs waarvan de PR niet (meer) in de lijst staat, zoals de lessen-run die
 * na een merge start: het detailpaneel toont alleen de run van de
 * geselecteerde PR, dus zonder deze lijst is zo'n run niet te volgen of te
 * stoppen. Een lopende run blijft altijd staan, een afgeronde tot de
 * gebruiker hem sluit. Een geslaagde run zonder bewaarde worktree laat niets
 * te doen achter en valt weg: anders duikt elke oude run op zodra zijn PR na
 * een merge uit de lijst valt. Een geannuleerde blijft staan, want een
 * time-out zet die status al vóór Rust het stoppen bevestigt.
 */
export function detachedRuns(
  runs: Iterable<AgentRun>,
  prKeys: ReadonlySet<string>,
): AgentRun[] {
  return [...runs].filter(
    (run) =>
      !prKeys.has(run.prKey) &&
      (run.status === "running" || (needsAttention(run) && !run.dismissed)),
  );
}

function needsAttention(run: AgentRun): boolean {
  return run.status !== "done" || run.keptWorktree != null;
}
