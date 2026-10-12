import { describe, expect, it } from "vitest";
import {
  buildUnifiedItems,
  isGeneratedPath,
  type LineNumbers,
  placeThreads,
} from "./diffModel";
import type { DiffLine } from "./diffParse";

function lines(...pairs: [DiffLine["kind"], string][]): DiffLine[] {
  return pairs.map(([kind, text]) => ({ kind, text }));
}

describe("buildUnifiedItems", () => {
  it("leest startnummers en functiecontext uit de hunk-header", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -10,3 +12,4 @@ fn foo()"], ["context", " x"]),
    );
    expect(items[0]).toEqual({
      kind: "hunk",
      oldStart: 10,
      newStart: 12,
      context: "fn foo()",
    });
    expect(items[1]).toEqual({
      kind: "row",
      type: "context",
      oldNo: 10,
      newNo: 12,
      text: "x",
    });
  });

  it("geeft lege context als er niets na de tweede @@ staat", () => {
    const items = buildUnifiedItems(lines(["hunk", "@@ -1 +1 @@"]));
    expect(items[0]).toEqual({
      kind: "hunk",
      oldStart: 1,
      newStart: 1,
      context: "",
    });
  });

  it("nummert een del-run gevolgd door een add-run", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -5,2 +5,2 @@"],
        ["del", "-a"],
        ["del", "-b"],
        ["add", "+x"],
        ["add", "+y"],
      ),
    );
    expect(items.slice(1)).toEqual([
      { kind: "row", type: "del", oldNo: 5, newNo: null, text: "a" },
      { kind: "row", type: "del", oldNo: 6, newNo: null, text: "b" },
      { kind: "row", type: "add", oldNo: null, newNo: 5, text: "x" },
      { kind: "row", type: "add", oldNo: null, newNo: 6, text: "y" },
    ]);
  });

  it("reset de tellers bij een tweede hunk", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,1 +1,1 @@"],
        ["context", " a"],
        ["hunk", "@@ -20,1 +30,1 @@"],
        ["context", " b"],
      ),
    );
    expect(items[3]).toEqual({
      kind: "row",
      type: "context",
      oldNo: 20,
      newNo: 30,
      text: "b",
    });
  });

  it("slaat metaregels en de no-newline-marker over zonder tellers te verschuiven", () => {
    const items = buildUnifiedItems(
      lines(
        ["meta", "index abc..def 100644"],
        ["hunk", "@@ -1,1 +1,1 @@"],
        ["del", "-a"],
        ["context", "\\ No newline at end of file"],
        ["add", "+b"],
      ),
    );
    expect(items).toEqual([
      { kind: "hunk", oldStart: 1, newStart: 1, context: "" },
      { kind: "row", type: "del", oldNo: 1, newNo: null, text: "a" },
      { kind: "row", type: "add", oldNo: null, newNo: 1, text: "b" },
    ]);
  });
});

const rows: LineNumbers[] = [
  { oldNo: 1, newNo: 1 }, // 0 context
  { oldNo: 2, newNo: null }, // 1 del
  { oldNo: null, newNo: 2 }, // 2 add
];

type T = { id: string; line: number | null; diffSide: "LEFT" | "RIGHT" };
const t = (id: string, line: number | null, diffSide: T["diffSide"]): T => ({
  id,
  line,
  diffSide,
});

describe("placeThreads", () => {
  it("plaatst RIGHT op de rij met die newNo", () => {
    const a = t("a", 2, "RIGHT");
    const { atRow, outdated } = placeThreads(rows, [a]);
    expect(atRow.get(2)).toEqual([a]);
    expect(outdated).toEqual([]);
  });

  it("plaatst LEFT op de verwijderde rij", () => {
    const a = t("a", 2, "LEFT");
    expect(placeThreads(rows, [a]).atRow.get(1)).toEqual([a]);
  });

  it("valt voor LEFT terug op een context-rij", () => {
    const a = t("a", 1, "LEFT");
    expect(placeThreads(rows, [a]).atRow.get(0)).toEqual([a]);
  });

  it("zet een thread zonder regel in outdated", () => {
    const a = t("a", null, "RIGHT");
    expect(placeThreads(rows, [a]).outdated).toEqual([a]);
  });

  it("zet een regel buiten de diff in outdated", () => {
    const a = t("a", 99, "RIGHT");
    const result = placeThreads(rows, [a]);
    expect(result.outdated).toEqual([a]);
    expect(result.atRow.size).toBe(0);
  });

  it("houdt twee threads op één rij in invoervolgorde", () => {
    const a = t("a", 2, "RIGHT");
    const b = t("b", 2, "RIGHT");
    expect(placeThreads(rows, [a, b]).atRow.get(2)).toEqual([a, b]);
  });
});

describe("isGeneratedPath", () => {
  it.each([
    "pnpm-lock.yaml",
    "packages/a/package-lock.json",
    "yarn.lock",
    "bun.lockb",
    "src-tauri/Cargo.lock",
    "composer.lock",
    "Gemfile.lock",
    "poetry.lock",
    "src/__snapshots__/a.test.ts.snap",
    "public/app.min.js",
    "public/app.min.css",
    "public/app.js.map",
    "dist/x.js",
    "packages/a/dist/x.js",
    "build/out.txt",
  ])("herkent %s als gegenereerd", (path) => {
    expect(isGeneratedPath(path)).toBe(true);
  });

  it.each([
    "src/distance.ts",
    "docs/build-notes.md",
    "src/app.ts",
    "src/lockfile.ts",
  ])("laat %s met rust", (path) => {
    expect(isGeneratedPath(path)).toBe(false);
  });
});
