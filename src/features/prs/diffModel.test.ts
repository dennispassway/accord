import { describe, expect, it } from "vitest";
import {
  buildUnifiedItems,
  countChanges,
  fileStatus,
  groupThreadsByFile,
  hiddenAbove,
  hiddenBelow,
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
  { oldNo: 1, newNo: 1 },
  { oldNo: 2, newNo: null },
  { oldNo: null, newNo: 2 },
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
    "public/app.min.mjs",
    "public/app.min.json",
    "npm-shrinkwrap.json",
    "app/pubspec.lock",
    "mix.lock",
    "go.sum",
    "flake.lock",
  ])("herkent %s als gegenereerd", (path) => {
    expect(isGeneratedPath(path)).toBe(true);
  });

  it.each([
    "src/distance.ts",
    "docs/build-notes.md",
    "src/app.ts",
    "src/lockfile.ts",
    "src/admin.minimal.ts",
    "src/go.sum.ts",
  ])("laat %s met rust", (path) => {
    expect(isGeneratedPath(path)).toBe(false);
  });
});

describe("countChanges", () => {
  it("telt adds en dels van regels", () => {
    expect(
      countChanges(lines(["add", "+a"], ["del", "-b"], ["context", " c"])),
    ).toEqual({ add: 1, del: 1 });
  });

  it("telt over meerdere bestanden", () => {
    const files = [
      { path: "a", lines: lines(["add", "+1"], ["add", "+2"]) },
      { path: "b", lines: lines(["del", "-1"]) },
    ];
    expect(countChanges(files)).toEqual({ add: 2, del: 1 });
  });
});

describe("groupThreadsByFile", () => {
  const files = [
    { path: "a.ts", lines: [] },
    { path: "b.ts", lines: [] },
  ];

  it("groepeert per pad in invoervolgorde en zet de rest in elsewhere", () => {
    const a1 = { path: "a.ts", id: "1" };
    const a2 = { path: "a.ts", id: "2" };
    const gone = { path: "weg.ts", id: "3" };
    const { byPath, elsewhere } = groupThreadsByFile(files, [a1, gone, a2]);
    expect(byPath.get("a.ts")).toEqual([a1, a2]);
    expect(byPath.get("b.ts")).toEqual([]);
    expect(elsewhere).toEqual([gone]);
  });

  it("zet alles in elsewhere zonder bestanden", () => {
    const t = { path: "a.ts" };
    expect(groupThreadsByFile([], [t]).elsewhere).toEqual([t]);
  });
});

function metaLines(...texts: string[]): DiffLine[] {
  return texts.map((text) => ({ kind: "meta", text }));
}

describe("fileStatus", () => {
  it("meldt een binair bestand", () => {
    expect(
      fileStatus(
        metaLines(
          "index 1..2 100644",
          "Binary files a/i.png and b/i.png differ",
        ),
      ),
    ).toBe("Binair bestand");
  });

  it("meldt een git binary patch als binair", () => {
    expect(fileStatus(metaLines("index 1..2", "GIT binary patch"))).toBe(
      "Binair bestand",
    );
  });

  it("noemt het oude pad bij een pure rename", () => {
    expect(
      fileStatus(
        metaLines(
          "similarity index 100%",
          "rename from src/old.ts",
          "rename to src/new.ts",
        ),
      ),
    ).toBe("Hernoemd van src/old.ts");
  });

  it("ge-unquote het oude pad van een rename", () => {
    expect(
      fileStatus(metaLines('rename from "caf\\303\\251.txt"', "rename to x")),
    ).toBe("Hernoemd van café.txt");
  });

  it("noemt de bron van een kopie", () => {
    expect(fileStatus(metaLines("copy from a.ts", "copy to b.ts"))).toBe(
      "Gekopieerd van a.ts",
    );
  });

  it("meldt alleen gewijzigde bestandsrechten met beide modi", () => {
    expect(fileStatus(metaLines("old mode 100644", "new mode 100755"))).toBe(
      "Alleen bestandsrechten gewijzigd (100644 → 100755)",
    );
  });

  it("meldt een leeg toegevoegd of verwijderd bestand", () => {
    expect(
      fileStatus(metaLines("new file mode 100644", "index 0000000..e69de29")),
    ).toBe("Leeg bestand toegevoegd");
    expect(
      fileStatus(
        metaLines("deleted file mode 100644", "index e69de29..0000000"),
      ),
    ).toBe("Leeg bestand verwijderd");
  });

  it("geeft null als het bestand hunks heeft", () => {
    expect(
      fileStatus([
        { kind: "meta", text: "index 1..2 100644" },
        { kind: "hunk", text: "@@ -1 +1 @@" },
      ]),
    ).toBeNull();
  });

  it("valt terug op een neutrale melding als de meta niets aantoont", () => {
    expect(fileStatus(metaLines("index 1..2 100644"))).toBe(
      "Geen regelwijzigingen",
    );
  });
});

describe("hiddenAbove / hiddenBelow", () => {
  const ctx = (n: number): [DiffLine["kind"], string] => ["context", ` l${n}`];

  it("geeft null boven een hunk die op regel 1 begint", () => {
    const items = buildUnifiedItems(lines(["hunk", "@@ -1,2 +1,2 @@"], ctx(1)));
    expect(hiddenAbove(items, 0)).toBeNull();
  });

  it("geeft regel 1 t/m newStart-1 boven hunk 0 op regel 10", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -10,2 +10,2 @@"], ctx(10)),
    );
    expect(hiddenAbove(items, 0)).toEqual({
      newFrom: 1,
      newTo: 9,
      oldOffset: 0,
    });
  });

  it("geeft het gat tussen twee hunks", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ctx(1),
        ctx(2),
        ["hunk", "@@ -10,1 +10,1 @@"],
        ctx(10),
      ),
    );
    expect(hiddenAbove(items, 1)).toEqual({
      newFrom: 3,
      newTo: 9,
      oldOffset: 0,
    });
  });

  it("geeft null tussen aaneensluitende hunks", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ctx(1),
        ctx(2),
        ["hunk", "@@ -3,1 +3,1 @@"],
        ctx(3),
      ),
    );
    expect(hiddenAbove(items, 1)).toBeNull();
  });

  it("geeft null voor een onbestaande hunkIndex", () => {
    const items = buildUnifiedItems(lines(["hunk", "@@ -5,1 +5,1 @@"], ctx(5)));
    expect(hiddenAbove(items, 3)).toBeNull();
  });

  it("geeft het gat onder de laatste hunk tot fileLength", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -1,2 +1,2 @@"], ctx(1), ctx(2)),
    );
    expect(hiddenBelow(items, 10)).toEqual({
      newFrom: 3,
      newTo: 10,
      oldOffset: 0,
    });
  });

  it("geeft null onder als de hunk het einde raakt", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -1,2 +1,2 @@"], ctx(1), ctx(2)),
    );
    expect(hiddenBelow(items, 2)).toBeNull();
  });

  it("rekent de offset door na regels die een eerdere hunk toevoegde", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,4 @@"],
        ["add", "+a"],
        ["add", "+b"],
        ctx(1),
        ctx(2),
        ["hunk", "@@ -20,1 +22,1 @@"],
        ctx(20),
      ),
    );
    expect(hiddenAbove(items, 1)).toEqual({
      newFrom: 5,
      newTo: 21,
      oldOffset: -2,
    });
    expect(hiddenBelow(items, 30)).toEqual({
      newFrom: 23,
      newTo: 30,
      oldOffset: -2,
    });
  });

  it("telt verwijderde regels mee in de offset onder de laatste hunk", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -5,2 +5,1 @@"], ["del", "-x"], ctx(6)),
    );
    expect(hiddenBelow(items, 9)).toEqual({
      newFrom: 6,
      newTo: 9,
      oldOffset: 1,
    });
  });

  it("leest een kop zonder tellingen als telling 1", () => {
    const items = buildUnifiedItems(lines(["hunk", "@@ -10 +10 @@"], ctx(10)));
    expect(hiddenAbove(items, 0)).toEqual({
      newFrom: 1,
      newTo: 9,
      oldOffset: 0,
    });
  });

  it("neemt bij +N,0 (pure verwijdering) regel N nog in het gat boven en begint N+1 erna", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -5,2 +4,0 @@"],
        ["del", "-a"],
        ["del", "-b"],
        ["hunk", "@@ -20,1 +18,1 @@"],
        ctx(20),
      ),
    );
    expect(hiddenAbove(items, 0)).toEqual({
      newFrom: 1,
      newTo: 4,
      oldOffset: 0,
    });
    // Twee oude regels vielen weg: oud 20 is nieuw 18, dus offset 2.
    expect(hiddenAbove(items, 1)).toEqual({
      newFrom: 5,
      newTo: 17,
      oldOffset: 2,
    });
    expect(hiddenBelow(items.slice(0, 3), 10)).toEqual({
      newFrom: 5,
      newTo: 10,
      oldOffset: 2,
    });
  });

  it("neemt bij -N,0 (pure toevoeging) regel N van het oude bestand mee in de offsets", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -4,0 +5,2 @@"], ["add", "+a"], ["add", "+b"]),
    );
    expect(hiddenAbove(items, 0)).toEqual({
      newFrom: 1,
      newTo: 4,
      oldOffset: 0,
    });
    expect(hiddenBelow(items, 10)).toEqual({
      newFrom: 7,
      newTo: 10,
      oldOffset: -2,
    });
  });

  it("geeft geen gaten bij een nieuw bestand of een volledig verwijderd bestand", () => {
    const added = buildUnifiedItems(
      lines(["hunk", "@@ -0,0 +1,2 @@"], ["add", "+a"], ["add", "+b"]),
    );
    expect(hiddenAbove(added, 0)).toBeNull();
    expect(hiddenBelow(added, 2)).toBeNull();
    const removed = buildUnifiedItems(
      lines(["hunk", "@@ -1,2 +0,0 @@"], ["del", "-a"], ["del", "-b"]),
    );
    expect(hiddenAbove(removed, 0)).toBeNull();
    expect(hiddenBelow(removed, 0)).toBeNull();
  });
});
