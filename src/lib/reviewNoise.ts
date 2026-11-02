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

type NoiseStore = Record<string, NoiseCounts>;

/** Corrupte JSON of een andere vorm geeft een lege opslag. */
export function parseNoise(raw: string | null): NoiseStore {
  try {
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object") return {};
    const entries = Object.entries(parsed).filter(([, v]) => isCounts(v));
    return Object.fromEntries(entries) as NoiseStore;
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
  const all = parseNoise(noiseSnapshot());
  const key = `${repoId}#${number}`;
  const old = all[key];
  if (counts.gefixt + counts.weerlegd + counts.open === 0) {
    if (old === undefined) return;
    delete all[key];
  } else {
    if (
      old?.gefixt === counts.gefixt &&
      old.weerlegd === counts.weerlegd &&
      old.open === counts.open
    ) {
      return;
    }
    all[key] = counts;
  }
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(all));
    window.dispatchEvent(new Event(NOISE_EVENT));
  } catch {
    // Opslag vol of geblokkeerd: de meting is een extraatje.
  }
}

export function prNoise(
  repoId: string,
  number: number,
  all: NoiseStore = parseNoise(noiseSnapshot()),
): NoiseCounts | null {
  return all[`${repoId}#${number}`] ?? null;
}

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

export function repoNoise(
  repoId: string,
  all: NoiseStore = parseNoise(noiseSnapshot()),
): {
  prs: number;
  counts: NoiseCounts;
} {
  const counts: NoiseCounts = { gefixt: 0, weerlegd: 0, open: 0 };
  let prs = 0;
  for (const [key, c] of Object.entries(all)) {
    if (key.slice(0, key.lastIndexOf("#")) !== repoId) continue;
    prs += 1;
    counts.gefixt += c.gefixt;
    counts.weerlegd += c.weerlegd;
    counts.open += c.open;
  }
  return { prs, counts };
}
