import type { PullRequest } from "../../lib/github/domain";
import { keyOfPr } from "./PrList";
import type { PrStatusKey } from "./rank";

/** Een snooze onthoudt tot wanneer, en de toestand van de PR op het moment
 * van snoozen: verandert die toestand (activiteit, andere sectie), dan komt
 * de PR eerder terug dan `until`. */
export interface SnoozeEntry {
  /** ISO-instant waarop de snooze afloopt. */
  until: string;
  /** pr.updatedAt op het moment van snoozen; activiteit (push, review,
   * comment) verandert dit veld en beëindigt de snooze meteen. */
  updatedAt: string;
  sectionKey: PrStatusKey;
}

export type SnoozeStore = Record<string, SnoozeEntry>;

const STORAGE_KEY = "pr-cockpit.snoozes";

const SECTION_KEYS: Record<PrStatusKey, true> = {
  review: true,
  klaar: true,
  actie: true,
  wachtReview: true,
  agent: true,
  wachten: true,
  concept: true,
};

interface SnoozeStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isValidEntry(value: unknown): value is SnoozeEntry {
  if (value == null || typeof value !== "object") return false;
  const entry = value as Partial<SnoozeEntry>;
  return (
    typeof entry.until === "string" &&
    !Number.isNaN(new Date(entry.until).getTime()) &&
    typeof entry.updatedAt === "string" &&
    typeof entry.sectionKey === "string" &&
    entry.sectionKey in SECTION_KEYS
  );
}

/** Onthouden snoozes; corrupte of ongeldige entries vallen stil weg (zelfde
 * patroon als loadFavorites in cockpitPrefs.ts). */
export function loadSnoozes(
  storage: SnoozeStorage = localStorage,
): SnoozeStore {
  const stored = storage.getItem(STORAGE_KEY);
  if (stored == null) return {};
  try {
    const parsed: unknown = JSON.parse(stored);
    if (parsed == null || typeof parsed !== "object") return {};
    const out: SnoozeStore = {};
    for (const [key, value] of Object.entries(
      parsed as Record<string, unknown>,
    )) {
      if (isValidEntry(value)) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

export function saveSnoozes(
  store: SnoozeStore,
  storage: SnoozeStorage = localStorage,
): void {
  storage.setItem(STORAGE_KEY, JSON.stringify(store));
}

/** Secties die zelf voorbijgaande GitHub-toestanden zijn (mergeable UNKNOWN
 * na een merge op main, checks die opnieuw draaien, een lopende agent-run):
 * een snooze mag daar niet wakker van worden, in geen van beide richtingen.
 * Ander sectiewisselingen zijn wel een echte statusverandering. */
const TRANSIENT_SECTIONS = new Set<PrStatusKey>(["wachten", "agent"]);

function sectionChangeWakes(
  snoozedSectionKey: PrStatusKey,
  currentSectionKey: PrStatusKey,
): boolean {
  if (snoozedSectionKey === currentSectionKey) return false;
  if (
    TRANSIENT_SECTIONS.has(snoozedSectionKey) ||
    TRANSIENT_SECTIONS.has(currentSectionKey)
  ) {
    return false;
  }
  return true;
}

/** False zodra de snooze afgelopen is, de PR intussen actief werd (andere
 * updatedAt) of echt van sectie wisselde (een tijdelijke uitstap naar
 * "wachten" of "agent" en terug telt niet als wisseling). */
export function isSnoozed(
  entry: SnoozeEntry,
  pr: PullRequest,
  currentSectionKey: PrStatusKey,
  now: Date,
): boolean {
  if (now.getTime() >= new Date(entry.until).getTime()) return false;
  if (pr.updatedAt !== entry.updatedAt) return false;
  if (sectionChangeWakes(entry.sectionKey, currentSectionKey)) return false;
  return true;
}

/** Verwijdert entries die niet meer snoozed zijn, en entries van PR's die
 * niet meer in de volledige, opgehaalde lijst voorkomen (gemerged/gesloten).
 * Roep dit alleen aan met de volledige lijst, niet met een gefilterde
 * subset. */
export function pruneSnoozes(
  store: SnoozeStore,
  allPrs: PullRequest[],
  sectionKeyOf: (pr: PullRequest) => PrStatusKey,
  now: Date,
): SnoozeStore {
  const byKey = new Map(allPrs.map((pr) => [keyOfPr(pr), pr]));
  const out: SnoozeStore = {};
  for (const [key, entry] of Object.entries(store)) {
    const pr = byKey.get(key);
    if (pr == null) continue;
    if (!isSnoozed(entry, pr, sectionKeyOf(pr), now)) continue;
    out[key] = entry;
  }
  return out;
}

/** Amsterdamse wall-clock offset (in minuten, UTC min lokale tijd) op een
 * gegeven instant: de DST-correcte manier om "morgen 09:00 Amsterdam" uit te
 * rekenen zonder een tijdzone-library. */
function amsterdamOffsetMinutes(date: Date): number {
  const dtf = new Intl.DateTimeFormat("en-US", {
    timeZone: "Europe/Amsterdam",
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(
    dtf.formatToParts(date).map((part) => [part.type, part.value]),
  );
  const asUtc = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
    Number(parts.second),
  );
  return Math.round((asUtc - date.getTime()) / 60000);
}

/** Bouwt een instant voor een Amsterdamse wall-clock datum/tijd, met de
 * offset van diezelfde dag (DST-correct: geen vaste UTC+1/+2-aanname). */
function amsterdamWallClockToInstant(
  year: number,
  month: number,
  day: number,
  hour: number,
  minute: number,
): Date {
  // Eerste gok met een instant op deze wall-clock-datum, om de offset van díe
  // dag te bepalen (de offset zelf hangt af van welke kant van de DST-knip we
  // zitten, dus we kunnen 'm niet los van een datum uitrekenen).
  const guess = Date.UTC(year, month, day, hour, minute);
  const offset = amsterdamOffsetMinutes(new Date(guess));
  return new Date(guess - offset * 60000);
}

/** Morgen 09:00 Amsterdamse tijd, DST-correct. */
export function tomorrowAt9(now: Date): Date {
  const offset = amsterdamOffsetMinutes(now);
  const local = new Date(now.getTime() + offset * 60000);
  return amsterdamWallClockToInstant(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + 1,
    9,
    0,
  );
}

/** Eerstvolgende maandag 09:00 Amsterdamse tijd: is het nu al maandag, dan de
 * maandag daarna (7 dagen verder), nooit vandaag. */
export function nextMondayAt9(now: Date): Date {
  const offset = amsterdamOffsetMinutes(now);
  const local = new Date(now.getTime() + offset * 60000);
  const weekday = local.getUTCDay(); // 0 = zondag, 1 = maandag
  const daysUntilMonday = weekday === 1 ? 7 : (8 - weekday) % 7 || 7;
  return amsterdamWallClockToInstant(
    local.getUTCFullYear(),
    local.getUTCMonth(),
    local.getUTCDate() + daysUntilMonday,
    9,
    0,
  );
}

/** Interpreteert een `<input type="datetime-local">`-waarde ("YYYY-MM-
 * DDTHH:mm") als Amsterdamse wall-clock tijd. */
export function fromAmsterdamLocal(value: string): Date {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (match == null)
    throw new Error(`Ongeldige datetime-local waarde: ${value}`);
  const [, year, month, day, hour, minute] = match as unknown as [
    string,
    string,
    string,
    string,
    string,
    string,
  ];
  return amsterdamWallClockToInstant(
    Number(year),
    Number(month) - 1,
    Number(day),
    Number(hour),
    Number(minute),
  );
}

const wallClockFormatter = new Intl.DateTimeFormat("en-US", {
  timeZone: "Europe/Amsterdam",
  hourCycle: "h23",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

/** Amsterdamse wall-clock tijd van een instant, in het formaat dat
 * `<input type="datetime-local">` als `min` verwacht ("YYYY-MM-DDTHH:mm");
 * het omgekeerde van `fromAmsterdamLocal`. */
export function toAmsterdamLocal(date: Date): string {
  const parts = Object.fromEntries(
    wallClockFormatter
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}

/** True als de gekozen datetime-local waarde leeg, ongeldig, of niet in de
 * toekomst is: de snoozepicker mag dan niet snoozen (een moment in het
 * verleden zou meteen weer wakker zijn). */
export function isPastOrNow(value: string, now: Date): boolean {
  if (value === "") return true;
  try {
    return fromAmsterdamLocal(value).getTime() <= now.getTime();
  } catch {
    return true;
  }
}
