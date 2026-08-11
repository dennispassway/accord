import { describe, expect, it } from "vitest";
import type { DiffLine } from "./diffParse";
import { buildSplitItems } from "./diffSplit";

function lines(...pairs: [DiffLine["kind"], string][]): DiffLine[] {
  return pairs.map(([kind, text]) => ({ kind, text }));
}

describe("buildSplitItems", () => {
  it("paart gelijke del/add-runs index-gewijs", () => {
    const items = buildSplitItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ["del", "-a"],
        ["del", "-b"],
        ["add", "+x"],
        ["add", "+y"],
      ),
    );
    const rows = items.filter((i) => i.kind === "row") as Extract<
      (typeof items)[number],
      { kind: "row" }
    >[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.left).toEqual({ kind: "del", text: "a", lineNo: 1 });
    expect(rows[0]?.right).toEqual({ kind: "add", text: "x", lineNo: 1 });
    expect(rows[1]?.left).toEqual({ kind: "del", text: "b", lineNo: 2 });
    expect(rows[1]?.right).toEqual({ kind: "add", text: "y", lineNo: 2 });
  });

  it("vult de kortste kant met empty-cellen bij ongelijke runs", () => {
    const items = buildSplitItems(
      lines(
        ["hunk", "@@ -1,1 +1,3 @@"],
        ["del", "-a"],
        ["add", "+x"],
        ["add", "+y"],
        ["add", "+z"],
      ),
    );
    const rows = items.filter((i) => i.kind === "row") as Extract<
      (typeof items)[number],
      { kind: "row" }
    >[];
    expect(rows).toHaveLength(3);
    expect(rows[0]?.left).toEqual({ kind: "del", text: "a", lineNo: 1 });
    expect(rows[0]?.right).toEqual({ kind: "add", text: "x", lineNo: 1 });
    expect(rows[1]?.left).toEqual({ kind: "empty", text: "", lineNo: null });
    expect(rows[1]?.right).toEqual({ kind: "add", text: "y", lineNo: 2 });
    expect(rows[2]?.left).toEqual({ kind: "empty", text: "", lineNo: null });
    expect(rows[2]?.right).toEqual({ kind: "add", text: "z", lineNo: 3 });
  });

  it("spiegelt context-regels naar beide kanten met eigen regelnummer", () => {
    const items = buildSplitItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ["context", " same"],
        ["context", " same2"],
      ),
    );
    const rows = items.filter((i) => i.kind === "row") as Extract<
      (typeof items)[number],
      { kind: "row" }
    >[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.left).toEqual({ kind: "context", text: "same", lineNo: 1 });
    expect(rows[0]?.right).toEqual({
      kind: "context",
      text: "same",
      lineNo: 1,
    });
    expect(rows[1]?.left).toEqual({
      kind: "context",
      text: "same2",
      lineNo: 2,
    });
    expect(rows[1]?.right).toEqual({
      kind: "context",
      text: "same2",
      lineNo: 2,
    });
  });

  it("houdt regelnummers correct over twee hunks met offset", () => {
    const items = buildSplitItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ["context", " a"],
        ["context", " b"],
        ["hunk", "@@ -3,4 +8,6 @@"],
        ["context", " c"],
        ["del", "-d"],
        ["add", "+e"],
        ["context", " f"],
      ),
    );
    const rows = items.filter((i) => i.kind === "row") as Extract<
      (typeof items)[number],
      { kind: "row" }
    >[];
    // rows: a,b (hunk1), c,d/e,f (hunk2)
    expect(rows[0]?.left.lineNo).toBe(1);
    expect(rows[0]?.right.lineNo).toBe(1);
    expect(rows[1]?.left.lineNo).toBe(2);
    expect(rows[1]?.right.lineNo).toBe(2);
    expect(rows[2]?.left).toEqual({ kind: "context", text: "c", lineNo: 3 });
    expect(rows[2]?.right).toEqual({ kind: "context", text: "c", lineNo: 8 });
    expect(rows[3]?.left).toEqual({ kind: "del", text: "d", lineNo: 4 });
    expect(rows[3]?.right).toEqual({ kind: "add", text: "e", lineNo: 9 });
    expect(rows[4]?.left).toEqual({ kind: "context", text: "f", lineNo: 5 });
    expect(rows[4]?.right).toEqual({ kind: "context", text: "f", lineNo: 10 });
  });

  it("toont alleen-adds (nieuw bestand) zonder linker paring", () => {
    const items = buildSplitItems(
      lines(
        ["hunk", "@@ -0,0 +1,2 @@"],
        ["add", "+eerste"],
        ["add", "+tweede"],
      ),
    );
    const rows = items.filter((i) => i.kind === "row") as Extract<
      (typeof items)[number],
      { kind: "row" }
    >[];
    expect(rows).toHaveLength(2);
    expect(rows[0]?.left).toEqual({ kind: "empty", text: "", lineNo: null });
    expect(rows[0]?.right).toEqual({ kind: "add", text: "eerste", lineNo: 1 });
    expect(rows[1]?.left).toEqual({ kind: "empty", text: "", lineNo: null });
    expect(rows[1]?.right).toEqual({ kind: "add", text: "tweede", lineNo: 2 });
  });

  it("negeert de 'geen newline'-marker en houdt del/add gepaard", () => {
    const items = buildSplitItems(
      lines(
        ["hunk", "@@ -1,1 +1,1 @@"],
        ["del", "-a"],
        ["context", "\\ No newline at end of file"],
        ["add", "+b"],
      ),
    );
    const rows = items.filter((i) => i.kind === "row") as Extract<
      (typeof items)[number],
      { kind: "row" }
    >[];
    expect(rows).toHaveLength(1);
    expect(rows[0]?.left).toEqual({ kind: "del", text: "a", lineNo: 1 });
    expect(rows[0]?.right).toEqual({ kind: "add", text: "b", lineNo: 1 });
  });

  it("zet meta- en hunk-regels door als eigen items", () => {
    const items = buildSplitItems(
      lines(
        ["meta", "index abc..def 100644"],
        ["hunk", "@@ -1,1 +1,1 @@"],
        ["context", " x"],
      ),
    );
    expect(items[0]).toEqual({ kind: "meta", text: "index abc..def 100644" });
    expect(items[1]).toEqual({ kind: "hunk", text: "@@ -1,1 +1,1 @@" });
    expect(items[2]?.kind).toBe("row");
  });
});
