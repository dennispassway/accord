import type { DiffSide } from "../../lib/github/prDetail";
import type { DraftThread } from "../../lib/github/review";

export interface ReviewDraft {
  id: string;
  path: string;
  line: number;
  side: DiffSide;
  body: string;
  createdAt: string;
}

const DIFF_SIDES: Record<DiffSide, true> = { LEFT: true, RIGHT: true };

const storageKey = (prKey: string) => `pr-cockpit.reviewDrafts.${prKey}`;

function isDraft(value: unknown): value is ReviewDraft {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.id === "string" &&
    typeof v.path === "string" &&
    typeof v.line === "number" &&
    typeof v.side === "string" &&
    Object.keys(DIFF_SIDES).includes(v.side) &&
    typeof v.body === "string" &&
    typeof v.createdAt === "string"
  );
}

/** prKey is `${repoId}#${number}` (zie keyOfPr in PrList.tsx). */
export function loadDrafts(prKey: string): ReviewDraft[] {
  try {
    const parsed: unknown = JSON.parse(
      localStorage.getItem(storageKey(prKey)) ?? "null",
    );
    return Array.isArray(parsed) ? parsed.filter(isDraft) : [];
  } catch {
    return [];
  }
}

export function saveDrafts(
  prKey: string,
  drafts: readonly ReviewDraft[],
): void {
  try {
    if (drafts.length === 0) localStorage.removeItem(storageKey(prKey));
    else localStorage.setItem(storageKey(prKey), JSON.stringify(drafts));
  } catch {
    // Opslag kan geblokkeerd of vol zijn: concepten zijn dan alleen in het geheugen.
  }
}

export function draftsToThreads(drafts: readonly ReviewDraft[]): DraftThread[] {
  return drafts.map(({ path, line, side, body }) => ({
    path,
    line,
    side,
    body,
  }));
}
