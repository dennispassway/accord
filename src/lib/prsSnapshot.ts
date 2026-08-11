import type { PullRequest } from "./github/domain";

/**
 * Bewaart de laatst opgehaalde PR-lijst zodat de app bij een koude start
 * meteen iets kan tonen (U2b), in plaats van een blanco laadscherm terwijl
 * de eerste fetch nog loopt. Puur een cache: corrupte of ontbrekende data
 * valt terug op "geen snapshot" en de normale eerste-load-flow.
 */
export interface PrsSnapshot {
  prs: PullRequest[];
  viewerLogin: string | null;
  /** ISO-string; Date is niet JSON-serialiseerbaar. */
  lastUpdated: string;
}

const STORAGE_KEY = "pr-cockpit.prsSnapshot";

/** Minimale Storage-vorm, zodat tests een in-memory fake kunnen meegeven
 * i.p.v. een DOM-omgeving nodig te hebben (zelfde patroon als `FetchImpl`). */
export interface SnapshotStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

export function loadPrsSnapshot(
  storage: SnapshotStorage = localStorage,
): PrsSnapshot | null {
  // Puur een cache: een storage die throwt (bv. bij afgesloten storage in
  // een private/sandboxed context) mag de app-mount nooit laten crashen.
  try {
    const raw = storage.getItem(STORAGE_KEY);
    if (raw == null) return null;
    const parsed = JSON.parse(raw) as Partial<PrsSnapshot>;
    if (!Array.isArray(parsed.prs) || typeof parsed.lastUpdated !== "string") {
      return null;
    }
    return {
      prs: parsed.prs,
      viewerLogin: parsed.viewerLogin ?? null,
      lastUpdated: parsed.lastUpdated,
    };
  } catch {
    return null;
  }
}

export function savePrsSnapshot(
  snapshot: PrsSnapshot,
  storage: SnapshotStorage = localStorage,
): void {
  // Puur een cache: een throwende setItem (bv. quota vol) mag een geslaagde
  // fetch niet alsnog als refreshError laten verschijnen.
  try {
    storage.setItem(STORAGE_KEY, JSON.stringify(snapshot));
  } catch {
    // negeren: de volgende fetch probeert het opnieuw
  }
}

/** Wist de bewaarde snapshot, zodat een koude start na uitloggen niet de
 * PR-lijst (titels, viewerLogin) van de vorige gebruiker toont. */
export function clearPrsSnapshot(
  storage: SnapshotStorage = localStorage,
): void {
  try {
    storage.removeItem?.(STORAGE_KEY);
  } catch {
    // negeren
  }
}
