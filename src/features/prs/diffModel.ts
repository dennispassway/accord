import type { DiffSide } from "../../lib/github/prDetail";
import { type DiffFile, type DiffLine, unquoteGitPath } from "./diffParse";

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
}

export type UnifiedItem = UnifiedRow | UnifiedHunk;

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@(.*)$/;

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
        newNo = Number(match[2]);
      }
      items.push({
        kind: "hunk",
        oldStart: oldNo,
        newStart: newNo,
        context: (match?.[3] ?? "").trim(),
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
