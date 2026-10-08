import type { AgentRun } from "./useAgentRuns";

/**
 * Runs waarvan de PR niet (meer) in de lijst staat, zoals de lessen-run die
 * na een merge start: het detailpaneel toont alleen de run van de
 * geselecteerde PR, dus zonder deze lijst is zo'n run niet te volgen of te
 * stoppen. Een lopende run blijft altijd staan; een afgeronde tot de
 * gebruiker hem sluit, zodat een bewaarde worktree bereikbaar blijft.
 */
export function detachedRuns(
  runs: Iterable<AgentRun>,
  prKeys: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
): AgentRun[] {
  return [...runs].filter(
    (run) =>
      !prKeys.has(run.prKey) &&
      (run.status === "running" || !dismissed.has(run.runId)),
  );
}
