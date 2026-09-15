/**
 * Probeert een actie een paar keer opnieuw. Bestaat voor de PR-refresh: die
 * vuurt op een interval en zodra het venster weer zichtbaar wordt, en dat
 * tweede moment valt vaak samen met wake uit sleep, waar het netwerk nog niet
 * staat. Eén mislukte poging werd daar meteen een rode banner.
 */
export interface RetryOptions {
  /** Totaal aantal pogingen, de eerste meegerekend. */
  attempts: number;
  /** Wachttijd vóór poging 2, 3, ... De laatste waarde geldt voor elke
   * volgende poging. */
  delaysMs: number[];
  /** Alleen fouten waarvoor dit `true` geeft worden opnieuw geprobeerd. */
  shouldRetry: (error: unknown) => boolean;
  /** Injecteerbaar zodat een test niet echt hoeft te wachten. */
  sleep?: (ms: number) => Promise<void>;
}

const defaultSleep = (ms: number): Promise<void> =>
  new Promise((resolve) => setTimeout(resolve, ms));

export async function withRetry<T>(
  run: () => Promise<T>,
  options: RetryOptions,
): Promise<T> {
  const sleep = options.sleep ?? defaultSleep;
  const total = Math.max(1, options.attempts);

  for (let attempt = 1; ; attempt += 1) {
    try {
      return await run();
    } catch (error) {
      if (attempt >= total || !options.shouldRetry(error)) throw error;
      await sleep(delayFor(options.delaysMs, attempt));
    }
  }
}

/** Poging 2 gebruikt de eerste delay, poging 3 de tweede, enzovoort; op is
 * op, dan blijft de laatste gelden. */
function delayFor(delaysMs: number[], attempt: number): number {
  if (delaysMs.length === 0) return 0;
  return delaysMs[attempt - 1] ?? delaysMs[delaysMs.length - 1] ?? 0;
}
