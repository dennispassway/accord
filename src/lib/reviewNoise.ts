import type { ReviewThread } from "./github/prDetail";

export type ThreadOutcome = "gefixt" | "weerlegd" | "open";

export interface NoiseCounts {
  gefixt: number;
  weerlegd: number;
  open: number;
}

const STORAGE_KEY = "pr-cockpit.reviewNoise";
const NOISE_EVENT = "pr-cockpit:review-noise";

/** Resolved + outdated: de regel veranderde, dus waarschijnlijk gefixt.
 * Resolved zonder dat: weerlegd (of elders opgelost, dat is een benadering). */
export function classifyThread(
  t: Pick<ReviewThread, "isResolved" | "isOutdated">,
): ThreadOutcome {
  if (!t.isResolved) return "open";
  return t.isOutdated ? "gefixt" : "weerlegd";
}

/** Telt alleen threads die bij een agent-review horen. */
export function countNoise(
  threads: Pick<ReviewThread, "isResolved" | "isOutdated" | "agentReview">[],
): NoiseCounts {
  const counts: NoiseCounts = { gefixt: 0, weerlegd: 0, open: 0 };
  for (const t of threads) {
    if (t.agentReview !== null) counts[classifyThread(t)] += 1;
  }
  return counts;
}

function isCounts(value: unknown): value is NoiseCounts {
  if (value === null || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    Number.isFinite(v.gefixt) &&
    Number.isFinite(v.weerlegd) &&
    Number.isFinite(v.open)
  );
}

/** Corrupte JSON of een andere vorm geeft een lege opslag; ongeldige
 * entries worden overgeslagen. */
function load(): Record<string, NoiseCounts> {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored === null) return {};
    const parsed: unknown = JSON.parse(stored);
    if (parsed === null || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed).filter(([, v]) => isCounts(v));
    return Object.fromEntries(entries) as Record<string, NoiseCounts>;
  } catch {
    return {};
  }
}

/** Overschrijft de entry van deze PR (geen dubbeltelling bij heropenen); een
 * PR zonder agent-threads wordt niet bewaard. */
export function recordNoise(
  repoId: string,
  number: number,
  counts: NoiseCounts,
): void {
  const all = load();
  const key = `${repoId}#${number}`;
  if (counts.gefixt + counts.weerlegd + counts.open === 0) {
    if (!(key in all)) return;
    delete all[key];
  } else {
    all[key] = counts;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(NOISE_EVENT));
  } catch {
    // Opslag vol of geblokkeerd: de meting is een extraatje.
  }
}

/** Opgeslagen counts van één PR, of null als er geen entry is. */
export function prNoise(repoId: string, number: number): NoiseCounts | null {
  return load()[`${repoId}#${number}`] ?? null;
}

/** Voor useSyncExternalStore: abonneert op schrijfacties van recordNoise. */
export function subscribeNoise(onChange: () => void): () => void {
  window.addEventListener(NOISE_EVENT, onChange);
  return () => window.removeEventListener(NOISE_EVENT, onChange);
}

/** Stabiele (primitieve) snapshot voor useSyncExternalStore. */
export function noiseSnapshot(): string | null {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

/** Som over alle bewaarde PR's van deze repo, plus het aantal PR's. */
export function repoNoise(repoId: string): {
  prs: number;
  counts: NoiseCounts;
} {
  const counts: NoiseCounts = { gefixt: 0, weerlegd: 0, open: 0 };
  let prs = 0;
  for (const [key, c] of Object.entries(load())) {
    if (key.slice(0, key.lastIndexOf("#")) !== repoId) continue;
    prs += 1;
    counts.gefixt += c.gefixt;
    counts.weerlegd += c.weerlegd;
    counts.open += c.open;
  }
  return { prs, counts };
}
