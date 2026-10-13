import type { DiffSide } from "../../lib/github/prDetail";
import { TOO_LARGE_LINE } from "../../lib/github/prFiles";
import { type DiffFile, type DiffLine, unquoteGitPath } from "./diffParse";
import { type Segment, wordDiff } from "./wordDiff";

export interface UnifiedRow {
  kind: "row";
  type: "add" | "del" | "context";
  oldNo: number | null;
  newNo: number | null;
  text: string;
}

export interface UnifiedHunk {
  kind: "hunk";
  oldStart: number;
  newStart: number;
  /** Tekst na de tweede @@ (functiecontext), getrimd; "" als leeg. */
  context: string;
  /** Alleen gezet (op 0) als de kop een telling 0 noemt: dan is oldStart/newStart de regel VÓÓR het hunk. Afwezig betekent: telling > 0 of niet genoemd. */
  oldCount?: 0;
  newCount?: 0;
}

export type UnifiedItem = UnifiedRow | UnifiedHunk;

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

export function buildUnifiedItems(lines: readonly DiffLine[]): UnifiedItem[] {
  const items: UnifiedItem[] = [];
  let oldNo = 0;
  let newNo = 0;

  for (const line of lines) {
    // "\ No newline at end of file" is geen echte regel: geen rij, geen teller.
    if (line.kind === "meta" || line.text.startsWith("\\")) continue;
    if (line.kind === "hunk") {
      const match = line.text.match(HUNK_HEADER);
      if (match) {
        oldNo = Number(match[1]);
        newNo = Number(match[3]);
      }
      items.push({
        kind: "hunk",
        oldStart: oldNo,
        newStart: newNo,
        context: (match?.[5] ?? "").trim(),
        ...(match?.[2] === "0" ? { oldCount: 0 as const } : {}),
        ...(match?.[4] === "0" ? { newCount: 0 as const } : {}),
      });
      continue;
    }
    const text = line.text.slice(1);
    if (line.kind === "del") {
      items.push({
        kind: "row",
        type: "del",
        oldNo: oldNo++,
        newNo: null,
        text,
      });
    } else if (line.kind === "add") {
      items.push({
        kind: "row",
        type: "add",
        oldNo: null,
        newNo: newNo++,
        text,
      });
    } else {
      items.push({
        kind: "row",
        type: "context",
        oldNo: oldNo++,
        newNo: newNo++,
        text,
      });
    }
  }
  return items;
}

export interface ThreadPlacementInput {
  line: number | null;
  diffSide: DiffSide;
}

export interface LineNumbers {
  oldNo: number | null;
  newNo: number | null;
}

/** Koppelt threads aan de weergegeven rij waar ze bij horen. De aanroeper
 * filtert threads al op pad. Wat niet te plaatsen is komt in `outdated`. */
export function placeThreads<T extends ThreadPlacementInput>(
  rows: readonly LineNumbers[],
  threads: readonly T[],
): { atRow: Map<number, T[]>; outdated: T[] } {
  const atRow = new Map<number, T[]>();
  const outdated: T[] = [];
  for (const thread of threads) {
    const index = rowIndexFor(rows, thread);
    if (index === -1) {
      outdated.push(thread);
      continue;
    }
    const bucket = atRow.get(index);
    if (bucket) bucket.push(thread);
    else atRow.set(index, [thread]);
  }
  return { atRow, outdated };
}

function rowIndexFor(
  rows: readonly LineNumbers[],
  { line, diffSide }: ThreadPlacementInput,
): number {
  if (line === null) return -1;
  if (diffSide === "RIGHT") return rows.findIndex((r) => r.newNo === line);
  const deleted = rows.findIndex((r) => r.oldNo === line && r.newNo === null);
  return deleted !== -1 ? deleted : rows.findIndex((r) => r.oldNo === line);
}

/** Telt toegevoegde en verwijderde regels van regels of van hele bestanden. */
export function countChanges(input: readonly (DiffLine | DiffFile)[]): {
  add: number;
  del: number;
} {
  let add = 0;
  let del = 0;
  for (const item of input) {
    if ("lines" in item) {
      const counts = countChanges(item.lines);
      add += counts.add;
      del += counts.del;
    } else if (item.kind === "add") add++;
    else if (item.kind === "del") del++;
  }
  return { add, del };
}

/** Verdeelt threads over de bestanden van de diff; wat bij geen enkel
 * diffbestand hoort komt in `elsewhere`. */
export function groupThreadsByFile<T extends { path: string }>(
  files: readonly DiffFile[],
  threads: readonly T[],
): { byPath: Map<string, T[]>; elsewhere: T[] } {
  const byPath = new Map<string, T[]>(files.map((file) => [file.path, []]));
  const elsewhere: T[] = [];
  for (const thread of threads) {
    const bucket = byPath.get(thread.path);
    if (bucket) bucket.push(thread);
    else elsewhere.push(thread);
  }
  return { byPath, elsewhere };
}

function metaValue(lines: readonly DiffLine[], prefix: string): string | null {
  const line = lines.find((l) => l.text.startsWith(prefix));
  return line ? line.text.slice(prefix.length) : null;
}

/** Korte omschrijving voor een bestand zonder hunks, afgeleid uit de
 * kopregels; null als het bestand wel hunks heeft. */
export function fileStatus(lines: readonly DiffLine[]): string | null {
  if (lines.some((l) => l.kind === "hunk")) return null;
  if (lines.some((l) => l.text === TOO_LARGE_LINE)) {
    return "Te groot om te tonen";
  }
  if (
    lines.some(
      (l) =>
        l.text.startsWith("Binary files ") || l.text === "GIT binary patch",
    )
  ) {
    return "Binair bestand";
  }
  const renamedFrom = metaValue(lines, "rename from ");
  if (renamedFrom !== null) {
    return `Hernoemd van ${unquoteGitPath(renamedFrom)}`;
  }
  const copiedFrom = metaValue(lines, "copy from ");
  if (copiedFrom !== null)
    return `Gekopieerd van ${unquoteGitPath(copiedFrom)}`;
  const oldMode = metaValue(lines, "old mode ");
  const newMode = metaValue(lines, "new mode ");
  if (oldMode !== null && newMode !== null) {
    return `Alleen bestandsrechten gewijzigd (${oldMode} → ${newMode})`;
  }
  if (metaValue(lines, "new file mode ") !== null) {
    return "Leeg bestand toegevoegd";
  }
  if (metaValue(lines, "deleted file mode ") !== null) {
    return "Leeg bestand verwijderd";
  }
  return "Geen regelwijzigingen";
}

const GENERATED_FILES = new Set([
  "pnpm-lock.yaml",
  "package-lock.json",
  "npm-shrinkwrap.json",
  "yarn.lock",
  "bun.lockb",
  "Cargo.lock",
  "composer.lock",
  "Gemfile.lock",
  "poetry.lock",
  "pubspec.lock",
  "mix.lock",
  "go.sum",
  "flake.lock",
]);

const GENERATED_DIRS = new Set(["dist", "build"]);
const GENERATED_SUFFIXES = [".snap", ".map"];
const MINIFIED = /\.min\.[^./]+$/;

export function isGeneratedPath(path: string): boolean {
  const parts = path.split("/");
  const name = parts[parts.length - 1] ?? "";
  if (GENERATED_FILES.has(name)) return true;
  if (MINIFIED.test(name)) return true;
  if (GENERATED_SUFFIXES.some((s) => name.endsWith(s))) return true;
  return parts.slice(0, -1).some((dir) => GENERATED_DIRS.has(dir));
}

export interface HiddenRange {
  /** Eerste en laatste verborgen regel in het NIEUWE bestand (1-based, inclusief). */
  newFrom: number;
  newTo: number;
  /** oldNo = newNo + oldOffset voor contextregels in dit gat. */
  oldOffset: number;
}

// oldStart/newStart 0 betekent een nieuw of volledig verwijderd bestand: daar is geen context.
function hasContext(hunk: UnifiedHunk): boolean {
  return hunk.oldStart > 0 && hunk.newStart > 0;
}

// Bij telling 0 is start de regel vóór het hunk: de eerste echte regel is start + 1.
function firstOld(hunk: UnifiedHunk): number {
  return hunk.oldStart + (hunk.oldCount === 0 ? 1 : 0);
}

function firstNew(hunk: UnifiedHunk): number {
  return hunk.newStart + (hunk.newCount === 0 ? 1 : 0);
}

/** Het gat vóór hunk nummer `hunkIndex` (0-based, telt alleen hunk-items). Null als er niets verborgen is. */
export function hiddenAbove(
  items: readonly UnifiedItem[],
  hunkIndex: number,
): HiddenRange | null {
  let seen = -1;
  let nextNew = 1;
  for (const item of items) {
    if (item.kind === "row") {
      if (item.newNo != null) nextNew = item.newNo + 1;
      continue;
    }
    seen++;
    if (seen !== hunkIndex) {
      nextNew = firstNew(item);
      continue;
    }
    if (!hasContext(item) || firstNew(item) - 1 < nextNew) return null;
    return {
      newFrom: nextNew,
      newTo: firstNew(item) - 1,
      oldOffset: firstOld(item) - firstNew(item),
    };
  }
  return null;
}

/** Het gat na de laatste hunk tot het einde van het bestand. Null als er niets verborgen is of fileLength onbekend (null). */
export function hiddenBelow(
  items: readonly UnifiedItem[],
  fileLength: number | null,
): HiddenRange | null {
  if (fileLength == null) return null;
  let nextOld = 0;
  let nextNew = 0;
  let usable = false;
  for (const item of items) {
    if (item.kind === "hunk") {
      usable = hasContext(item);
      nextOld = firstOld(item);
      nextNew = firstNew(item);
    } else {
      if (item.oldNo != null) nextOld = item.oldNo + 1;
      if (item.newNo != null) nextNew = item.newNo + 1;
    }
  }
  if (!usable || fileLength < nextNew) return null;
  return { newFrom: nextNew, newTo: fileLength, oldOffset: nextOld - nextNew };
}

/** Sleutel van een regel binnen één bestand: oud voor een verwijderde regel, nieuw voor de rest. */
export function lineKey(
  type: UnifiedRow["type"],
  oldNo: number | null,
  newNo: number | null,
): string {
  return type === "del" ? `old${oldNo}` : `new${newNo}`;
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

const WORD_OPEN = '<span class="inspector-diff-word">';

/**
 * Legt een woordmarkering over html die al ge-escaped is (hljs-uitvoer of
 * `escapeHtml`). De segmenten dekken de platte tekst achter die html; een
 * entity telt als één teken. Rond elke tag wordt de markering gesloten en
 * heropend, zodat hij nooit tegen een syntax-span in nest.
 */
export function markWords(html: string, segments: readonly Segment[]): string {
  const flags = segments.flatMap((s) =>
    Array.from({ length: s.text.length }, () => s.changed),
  );
  let out = "";
  let pos = 0;
  let open = false;
  const mark = (on: boolean) => {
    if (on === open) return;
    out += on ? WORD_OPEN : "</span>";
    open = on;
  };
  for (const part of html.split(/(<[^>]*>|&[#\w]+;)/)) {
    if (part.startsWith("<")) {
      mark(false);
      out += part;
    } else if (/^&[#\w]+;$/.test(part)) {
      mark(flags[pos++] ?? false);
      out += part;
    } else {
      for (const ch of part) {
        mark(flags[pos++] ?? false);
        out += ch;
      }
    }
  }
  mark(false);
  return out;
}

function run(
  items: readonly UnifiedItem[],
  from: number,
  type: UnifiedRow["type"],
): UnifiedRow[] {
  const rows: UnifiedRow[] = [];
  for (let i = from; i < items.length; i++) {
    const item = items[i];
    if (item?.kind !== "row" || item.type !== type) break;
    rows.push(item);
  }
  return rows;
}

/** Woordmarkering per regel (sleutel: `lineKey`): de i-de verwijderde regel van een blok met de i-de toegevoegde die er direct op volgt. Alleen regels met een echt verschil. */
export function wordSegments(
  items: readonly UnifiedItem[],
): Map<string, Segment[]> {
  const out = new Map<string, Segment[]>();
  let i = 0;
  while (i < items.length) {
    const item = items[i];
    if (item?.kind !== "row" || item.type !== "del") {
      i++;
      continue;
    }
    const dels = run(items, i, "del");
    const adds = run(items, i + dels.length, "add");
    for (let n = 0; n < Math.min(dels.length, adds.length); n++) {
      const del = dels[n];
      const add = adds[n];
      if (!del || !add) continue;
      const diff = wordDiff(del.text, add.text);
      if (![...diff.old, ...diff.new].some((s) => s.changed)) continue;
      out.set(lineKey("del", del.oldNo, null), diff.old);
      out.set(lineKey("add", null, add.newNo), diff.new);
    }
    i += dels.length + adds.length;
  }
  return out;
}

function contextRows(
  fileLines: readonly string[],
  range: HiddenRange | null,
): UnifiedRow[] {
  if (range === null) return [];
  const rows: UnifiedRow[] = [];
  for (let newNo = range.newFrom; newNo <= range.newTo; newNo++) {
    rows.push({
      kind: "row",
      type: "context",
      oldNo: newNo + range.oldOffset,
      newNo,
      text: fileLines[newNo - 1] ?? "",
    });
  }
  return rows;
}

/** Voegt de verborgen regels boven de gekozen hunks (0-based) en eventueel na het laatste hunk in als contextrijen. */
export function expandContext(
  items: readonly UnifiedItem[],
  fileLines: readonly string[],
  above: ReadonlySet<number>,
  below: boolean,
): UnifiedItem[] {
  const out: UnifiedItem[] = [];
  let hunk = -1;
  for (const item of items) {
    if (item.kind === "hunk") {
      hunk++;
      if (above.has(hunk)) {
        out.push(...contextRows(fileLines, hiddenAbove(items, hunk)));
      }
    }
    out.push(item);
  }
  if (below) {
    out.push(...contextRows(fileLines, hiddenBelow(items, fileLines.length)));
  }
  return out;
}
