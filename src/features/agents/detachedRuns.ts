import type { AgentRun } from "./useAgentRuns";

/**
 * Runs waarvan de PR niet (meer) in de lijst staat, zoals de lessen-run die
 * na een merge start: het detailpaneel toont alleen de run van de
 * geselecteerde PR, dus zonder deze lijst is zo'n run niet te volgen of te
 * stoppen. Een lopende run blijft altijd staan. Een afgeronde run alleen als
 * er nog iets te doen is (gefaald, bewaarde worktree, ontbrekende review), en
 * tot de gebruiker hem sluit. Zonder die eis duikt elke oude run op zodra zijn
 * PR na een merge uit de lijst valt.
 */
export function detachedRuns(
  runs: Iterable<AgentRun>,
  prKeys: ReadonlySet<string>,
  dismissed: ReadonlySet<string>,
): AgentRun[] {
  return [...runs].filter(
    (run) =>
      !prKeys.has(run.prKey) &&
      (run.status === "running" ||
        (needsAttention(run) && !dismissed.has(run.runId))),
  );
}

function needsAttention(run: AgentRun): boolean {
  return (
    run.status === "failed" ||
    run.keptWorktree != null ||
    run.reviewMissing === true
  );
}
