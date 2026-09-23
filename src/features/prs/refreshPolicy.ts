const MIN_HIDDEN_MINUTES = 15;

export interface RefreshPolicyInput {
  /** Instelling van de gebruiker; 0 = handmatig verversen. */
  refreshMinutes: number;
  /** Of het venster op dit moment verborgen is (menubalkmodus). */
  hidden: boolean;
}

/**
 * Bepaalt het automatische ververs-interval in milliseconden.
 * `refreshMinutes === 0` is handmatig: geen automatisch verversen, zichtbaar
 * of verborgen. Is het venster verborgen, dan verruimt het interval naar
 * minimaal 15 minuten, zodat de tellerbadge en CI-notificaties actueel
 * blijven zonder dat een stilstaand venster onnodig API-budget verbruikt.
 */
export function refreshIntervalMs({
  refreshMinutes,
  hidden,
}: RefreshPolicyInput): number | null {
  if (refreshMinutes === 0) return null;
  const minutes = hidden
    ? Math.max(MIN_HIDDEN_MINUTES, refreshMinutes)
    : refreshMinutes;
  return minutes * 60 * 1000;
}
