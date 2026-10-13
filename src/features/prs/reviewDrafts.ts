import { useCallback, useSyncExternalStore } from "react";
import type { DiffSide } from "../../lib/github/prDetail";
import type { DraftThread, ReviewEvent } from "../../lib/github/review";
import { buildUnifiedItems, placeThreads } from "./diffModel";
import type { DiffFile } from "./diffParse";

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

/** Dezelfde beslissing als `submitReview` in lib/github/review.ts: goedkeuren
 * mag zonder tekst, changes vragen niet, reageren alleen als er concepten
 * meegaan. Knoppen, sneltoets en de verzending lezen allemaal deze reden. */
export function reviewBlockedReason(
  event: ReviewEvent,
  body: string,
  draftCount: number,
): string | null {
  if (body.trim() !== "") return null;
  if (event === "REQUEST_CHANGES") {
    return "Schrijf een reactie om changes te vragen";
  }
  if (event === "COMMENT" && draftCount === 0) {
    return "Schrijf een reactie, of voeg eerst een opmerking op een regel toe";
  }
  return null;
}

/** Ids van concepten waarvan de regel niet in de diff zelf staat (bestand
 * ontbreekt, of de regel valt buiten de hunks): GitHub kan die weigeren.
 * Uitgeklapte context telt hier niet mee: dat is weergavestaat. */
export function draftsOutsideDiff(
  drafts: readonly ReviewDraft[],
  files: readonly DiffFile[],
): Set<string> {
  const rowsByPath = new Map(
    files.map((file) => [
      file.path,
      buildUnifiedItems(file.lines).flatMap((item) =>
        item.kind === "row" ? [{ oldNo: item.oldNo, newNo: item.newNo }] : [],
      ),
    ]),
  );
  const outside = new Set<string>();
  for (const d of drafts) {
    const rows = rowsByPath.get(d.path);
    const placed =
      rows !== undefined &&
      placeThreads(rows, [{ line: d.line, diffSide: d.side }]).outdated
        .length === 0;
    if (!placed) outside.add(d.id);
  }
  return outside;
}

export interface DraftInput {
  path: string;
  line: number;
  side: DiffSide;
  body: string;
}

export interface DraftStore {
  /** Stabiele array zolang er niets verandert (voor useSyncExternalStore). */
  get(prKey: string): readonly ReviewDraft[];
  subscribe(prKey: string, listener: () => void): () => void;
  /** Null bij een lege opmerking. */
  add(prKey: string, input: DraftInput): ReviewDraft | null;
  edit(prKey: string, id: string, body: string): void;
  remove(prKey: string, ids: readonly string[]): void;
  clear(prKey: string): void;
}

interface Persistence {
  load(prKey: string): ReviewDraft[];
  save(prKey: string, drafts: readonly ReviewDraft[]): void;
}

/** Eén bron voor de concepten van een PR: de inspector en het detailpaneel
 * lezen en schrijven hier, dus tellers lopen nooit uiteen. Het geheugen is de
 * waarheid (schrijven naar localStorage mag mislukken). */
export function createDraftStore(
  persistence: Persistence,
  newId: () => string,
  now: () => Date,
): DraftStore {
  const cache = new Map<string, readonly ReviewDraft[]>();
  const listeners = new Map<string, Set<() => void>>();

  const get = (prKey: string): readonly ReviewDraft[] => {
    let drafts = cache.get(prKey);
    if (drafts === undefined) {
      drafts = persistence.load(prKey);
      cache.set(prKey, drafts);
    }
    return drafts;
  };

  function set(prKey: string, next: readonly ReviewDraft[]) {
    cache.set(prKey, next);
    try {
      persistence.save(prKey, next);
    } catch {
      // Zie saveDrafts: alleen-geheugen is acceptabel.
    }
    for (const listener of listeners.get(prKey) ?? []) listener();
  }

  return {
    get,
    subscribe(prKey, listener) {
      const bucket = listeners.get(prKey) ?? new Set();
      bucket.add(listener);
      listeners.set(prKey, bucket);
      return () => {
        bucket.delete(listener);
      };
    },
    add(prKey, input) {
      if (input.body.trim() === "") return null;
      const draft: ReviewDraft = {
        id: newId(),
        ...input,
        createdAt: now().toISOString(),
      };
      set(prKey, [...get(prKey), draft]);
      return draft;
    },
    edit(prKey, id, body) {
      if (body.trim() === "") return;
      set(
        prKey,
        get(prKey).map((d) => (d.id === id ? { ...d, body } : d)),
      );
    },
    remove(prKey, ids) {
      const current = get(prKey);
      const next = current.filter((d) => !ids.includes(d.id));
      if (next.length !== current.length) set(prKey, next);
    },
    clear(prKey) {
      if (get(prKey).length > 0) set(prKey, []);
    },
  };
}

export const reviewDraftStore = createDraftStore(
  { load: loadDrafts, save: saveDrafts },
  () => crypto.randomUUID(),
  () => new Date(),
);

/** De concepten van één PR, live. */
export function useReviewDrafts(prKey: string): readonly ReviewDraft[] {
  const subscribe = useCallback(
    (listener: () => void) => reviewDraftStore.subscribe(prKey, listener),
    [prKey],
  );
  return useSyncExternalStore(subscribe, () => reviewDraftStore.get(prKey));
}
