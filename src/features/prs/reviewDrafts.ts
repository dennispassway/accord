import { useCallback, useSyncExternalStore } from "react";
import type { DiffSide } from "../../lib/github/prDetail";
import type { DraftThread } from "../../lib/github/review";
import { buildUnifiedItems, placeThreads } from "./diffModel";
import type { DiffFile } from "./diffParse";

export interface ReviewDraft extends DraftThread {
  id: string;
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

/** Mag gooien (opslag geblokkeerd of vol): de store vangt dat op en houdt de
 * concepten dan alleen in het geheugen. */
export function saveDrafts(
  prKey: string,
  drafts: readonly ReviewDraft[],
): void {
  if (drafts.length === 0) localStorage.removeItem(storageKey(prKey));
  else localStorage.setItem(storageKey(prKey), JSON.stringify(drafts));
}

export function draftsToThreads(drafts: readonly ReviewDraft[]): DraftThread[] {
  return drafts.map(({ path, line, side, body }) => ({
    path,
    line,
    side,
    body,
  }));
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

export interface DraftStore {
  /** Stabiele array zolang er niets verandert (voor useSyncExternalStore). */
  get(prKey: string): readonly ReviewDraft[];
  subscribe(prKey: string, listener: () => void): () => void;
  /** Null bij een lege opmerking. */
  add(prKey: string, input: DraftThread): ReviewDraft | null;
  edit(prKey: string, id: string, body: string): void;
  remove(prKey: string, ids: readonly string[]): void;
  /** De inspector meldt welke concepten buiten de diff vallen, zodat ook het
   * detailpaneel kan waarschuwen. Alleen bekend na een keer openen. */
  setOutside(prKey: string, ids: ReadonlySet<string>): void;
  /** Aantal bestaande concepten dat als buiten de diff is gemeld. */
  outsideCount(prKey: string): number;
  /** Verwijdert alleen de concepten uit `sent` die nog hetzelfde object zijn:
   * `edit` maakt een nieuw object, dus een bewerking na het versturen blijft. */
  removeIfUnchanged(prKey: string, sent: readonly ReviewDraft[]): void;
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
  const outside = new Map<string, ReadonlySet<string>>();

  const get = (prKey: string): readonly ReviewDraft[] => {
    let drafts = cache.get(prKey);
    if (drafts === undefined) {
      drafts = persistence.load(prKey);
      cache.set(prKey, drafts);
    }
    return drafts;
  };

  function notify(prKey: string) {
    for (const listener of listeners.get(prKey) ?? []) listener();
  }

  function set(prKey: string, next: readonly ReviewDraft[]) {
    cache.set(prKey, next);
    try {
      persistence.save(prKey, next);
    } catch {
      // Opslag geblokkeerd of vol: alleen-geheugen is acceptabel.
    }
    notify(prKey);
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
      const current = get(prKey);
      const next = current.map((d) =>
        d.id === id && d.body !== body ? { ...d, body } : d,
      );
      if (next.some((d, i) => d !== current[i])) set(prKey, next);
    },
    remove(prKey, ids) {
      const current = get(prKey);
      const next = current.filter((d) => !ids.includes(d.id));
      if (next.length !== current.length) set(prKey, next);
    },
    setOutside(prKey, ids) {
      const previous = outside.get(prKey);
      if (
        previous !== undefined &&
        previous.size === ids.size &&
        [...ids].every((id) => previous.has(id))
      ) {
        return;
      }
      outside.set(prKey, ids);
      notify(prKey);
    },
    outsideCount(prKey) {
      const ids = outside.get(prKey);
      return ids === undefined
        ? 0
        : get(prKey).filter((d) => ids.has(d.id)).length;
    },
    removeIfUnchanged(prKey, sent) {
      const current = get(prKey);
      const next = current.filter((d) => !sent.includes(d));
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

/** Aantal concepten dat buiten de diff valt, zoals de inspector het laatst zag. */
export function useOutsideDraftCount(prKey: string): number {
  const subscribe = useCallback(
    (listener: () => void) => reviewDraftStore.subscribe(prKey, listener),
    [prKey],
  );
  return useSyncExternalStore(subscribe, () =>
    reviewDraftStore.outsideCount(prKey),
  );
}
