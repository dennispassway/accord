/**
 * GitHub-achtige split-view items (oud links, nieuw rechts), opgebouwd uit de
 * unified items: alleen een del-run met de add-run die direct volgt wordt
 * naast elkaar gezet.
 */
import {
  buildUnifiedItems,
  type UnifiedHunk,
  type UnifiedRow,
} from "./diffModel";
import type { DiffLine } from "./diffParse";

interface SplitCell {
  kind: "add" | "del" | "context" | "empty";
  text: string;
  lineNo: number | null;
}

export type SplitRow = { kind: "row"; left: SplitCell; right: SplitCell };
export type SplitItem = SplitRow | UnifiedHunk;

const EMPTY: SplitCell = { kind: "empty", text: "", lineNo: null };

export function buildSplitItems(lines: readonly DiffLine[]): SplitItem[] {
  const unified = buildUnifiedItems(lines);
  const items: SplitItem[] = [];

  function run(from: number, type: UnifiedRow["type"]): UnifiedRow[] {
    const rows: UnifiedRow[] = [];
    for (let i = from; i < unified.length; i++) {
      const item = unified[i];
      if (item?.kind !== "row" || item.type !== type) break;
      rows.push(item);
    }
    return rows;
  }

  let i = 0;
  while (i < unified.length) {
    const item = unified[i];
    if (item === undefined) break;
    if (item.kind === "hunk") {
      items.push(item);
      i++;
    } else if (item.type === "context") {
      const cell = { kind: "context", text: item.text } as const;
      items.push({
        kind: "row",
        left: { ...cell, lineNo: item.oldNo },
        right: { ...cell, lineNo: item.newNo },
      });
      i++;
    } else {
      const dels = run(i, "del");
      const adds = run(i + dels.length, "add");
      for (let n = 0; n < Math.max(dels.length, adds.length); n++) {
        const del = dels[n];
        const add = adds[n];
        items.push({
          kind: "row",
          left: del
            ? { kind: "del", text: del.text, lineNo: del.oldNo }
            : EMPTY,
          right: add
            ? { kind: "add", text: add.text, lineNo: add.newNo }
            : EMPTY,
        });
      }
      i += dels.length + adds.length;
    }
  }

  return items;
}
