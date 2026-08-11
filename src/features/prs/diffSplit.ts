/**
 * Bouwt GitHub-achtige split-view items (oud links, nieuw rechts) uit de
 * platte regellijst van parseDiff. Pure functie, geen state.
 */
import type { DiffLine } from "./diffParse";

interface SplitCell {
  kind: "add" | "del" | "context" | "empty";
  text: string;
  lineNo: number | null;
}

export type SplitItem =
  | { kind: "row"; left: SplitCell; right: SplitCell }
  | { kind: "hunk"; text: string }
  | { kind: "meta"; text: string };

const HUNK_HEADER = /^@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

export function buildSplitItems(lines: DiffLine[]): SplitItem[] {
  const items: SplitItem[] = [];
  let oldNo = 0;
  let newNo = 0;
  let delBuf: string[] = [];
  let addBuf: string[] = [];

  function flush() {
    const len = Math.max(delBuf.length, addBuf.length);
    for (let i = 0; i < len; i++) {
      const delText = delBuf[i];
      const addText = addBuf[i];
      const left: SplitCell =
        delText !== undefined
          ? { kind: "del", text: delText, lineNo: oldNo++ }
          : { kind: "empty", text: "", lineNo: null };
      const right: SplitCell =
        addText !== undefined
          ? { kind: "add", text: addText, lineNo: newNo++ }
          : { kind: "empty", text: "", lineNo: null };
      items.push({ kind: "row", left, right });
    }
    delBuf = [];
    addBuf = [];
  }

  for (const line of lines) {
    // "\ No newline at end of file" is geen echte regel: overslaan, geen
    // flush en geen tellerwijziging, anders breekt de del/add-paring.
    if (line.text.startsWith("\\")) continue;
    if (line.kind === "hunk") {
      flush();
      const match = line.text.match(HUNK_HEADER);
      if (match) {
        oldNo = Number(match[1]);
        newNo = Number(match[2]);
      }
      items.push({ kind: "hunk", text: line.text });
      continue;
    }
    if (line.kind === "meta") {
      flush();
      items.push({ kind: "meta", text: line.text });
      continue;
    }
    if (line.kind === "del") {
      // Twee change-blokken direct na elkaar (zonder context): nieuwe
      // del-run start, vorige paring afronden.
      if (addBuf.length > 0) flush();
      delBuf.push(line.text.slice(1));
      continue;
    }
    if (line.kind === "add") {
      addBuf.push(line.text.slice(1));
      continue;
    }
    // context
    flush();
    const text = line.text.slice(1);
    items.push({
      kind: "row",
      left: { kind: "context", text, lineNo: oldNo++ },
      right: { kind: "context", text, lineNo: newNo++ },
    });
  }
  flush();

  return items;
}
