/** Uitkomst van één updater-check, ontkoppeld van het plugin-API zodat de
 * logica puur testbaar is. */
export type CheckOutcome =
  | { kind: "update"; version: string; notes: string }
  | { kind: "none" }
  | { kind: "error"; message: string };

export type UpdateState =
  | { status: "idle" }
  | { status: "available"; version: string; notes: string }
  | { status: "installing" };

/** Een check-fout blijft altijd stil: vóór de eerste release bestaat
 * latest.json niet (404) en een offline check mag geen UI opleveren. */
export function toUpdateState(
  outcome: CheckOutcome,
  dismissedVersion: string | null,
): UpdateState {
  if (outcome.kind !== "update") return { status: "idle" };
  if (dismissedVersion != null && dismissedVersion !== "") {
    if (outcome.version === dismissedVersion) return { status: "idle" };
  }
  return {
    status: "available",
    version: outcome.version,
    notes: outcome.notes,
  };
}

/** Zelfde ritme als de PR-refresh; 0 = handmatig, dan alleen de startcheck. */
export function checkIntervalMs(refreshMinutes: number): number | null {
  return refreshMinutes === 0 ? null : refreshMinutes * 60 * 1000;
}
