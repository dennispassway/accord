import { describe, expect, it } from "vitest";
import { buildUnifiedItems } from "./diffModel";
import { parseDiff } from "./diffParse";

const SAMPLE = `diff --git a/src/foo.ts b/src/foo.ts
index abc123..def456 100644
--- a/src/foo.ts
+++ b/src/foo.ts
@@ -1,3 +1,3 @@
 unchanged line
-old line
+new line
diff --git a/src/bar.ts b/src/bar.ts
new file mode 100644
index 0000000..123abc
--- /dev/null
+++ b/src/bar.ts
@@ -0,0 +1,2 @@
+eerste
+tweede
`;

describe("parseDiff", () => {
  it("splitst op diff --git en herkent het b-pad", () => {
    const files = parseDiff(SAMPLE);
    expect(files.map((f) => f.path)).toEqual(["src/foo.ts", "src/bar.ts"]);
  });

  it("classificeert regels van het eerste bestand", () => {
    const [foo] = parseDiff(SAMPLE);
    expect(foo?.lines.map((l) => l.kind)).toEqual([
      "meta", // index
      "meta", // ---
      "meta", // +++
      "hunk", // @@
      "context",
      "del",
      "add",
    ]);
  });

  it("classificeert een nieuw bestand", () => {
    const [, bar] = parseDiff(SAMPLE);
    expect(bar?.lines.map((l) => l.kind)).toEqual([
      "meta", // new file mode
      "meta", // index
      "meta", // ---
      "meta", // +++
      "hunk",
      "add",
      "add",
    ]);
  });

  it("gebruikt het a-pad bij een delete (b-pad is /dev/null)", () => {
    const deleteDiff = `diff --git a/src/gone.ts b/src/gone.ts
deleted file mode 100644
index abc123..0000000
--- a/src/gone.ts
+++ /dev/null
@@ -1,1 +0,0 @@
-weg
`;
    const [file] = parseDiff(deleteDiff);
    expect(file?.path).toBe("src/gone.ts");
  });

  it("herkent een rename door verschillende a/b-paden", () => {
    const renameDiff = `diff --git a/src/old.ts b/src/new.ts
similarity index 100%
rename from src/old.ts
rename to src/new.ts
`;
    const [file] = parseDiff(renameDiff);
    expect(file?.path).toBe("src/new.ts");
  });

  it("lege input geeft een lege lijst", () => {
    expect(parseDiff("")).toEqual([]);
  });

  it("herkent een binary file als meta", () => {
    const binaryDiff = `diff --git a/img.png b/img.png
index abc123..def456 100644
Binary files a/img.png and b/img.png differ
`;
    const [file] = parseDiff(binaryDiff);
    expect(file?.lines.map((l) => l.kind)).toEqual(["meta", "meta"]);
  });

  it.each([
    "old mode 100644",
    "new mode 100755",
    "copy from a.ts",
    "copy to b.ts",
    "dissimilarity index 20%",
  ])("ziet %s vóór de eerste hunk als meta", (header) => {
    const [file] = parseDiff(`diff --git a/a.ts b/b.ts\n${header}\n`);
    expect(file?.lines.map((l) => l.kind)).toEqual(["meta"]);
  });

  it("laat in een hunk alleen het eerste teken het kind bepalen", () => {
    const [file] = parseDiff(`diff --git a/a.md b/a.md
--- a/a.md
+++ b/a.md
@@ -1,4 +1,4 @@
--- x
----
++i
 ctx
\\ No newline at end of file
`);
    expect(file?.lines.map((l) => l.kind)).toEqual([
      "meta",
      "meta",
      "hunk",
      "del",
      "del",
      "add",
      "context",
      "context",
    ]);
  });

  it("houdt regelnummers kloppend na een verwijderde '-- x'-regel", () => {
    const [file] = parseDiff(`diff --git a/a.sql b/a.sql
--- a/a.sql
+++ b/a.sql
@@ -1,3 +1,2 @@
--- commentaar
 select 1;
 select 2;
`);
    const rows = buildUnifiedItems(file?.lines ?? []).filter(
      (item) => item.kind === "row",
    );
    expect(rows.map((r) => [r.oldNo, r.newNo])).toEqual([
      [1, null],
      [2, 1],
      [3, 2],
    ]);
  });

  it("herkent gequote paden met spaties", () => {
    const [file] = parseDiff(`diff --git "a/x y.txt" "b/x y.txt"
--- "a/x y.txt"
+++ "b/x y.txt"
@@ -1 +1 @@
-a
+b
`);
    expect(file?.path).toBe("x y.txt");
  });

  it("zet octale escapes om naar UTF-8", () => {
    const [file] =
      parseDiff(`diff --git "a/caf\\303\\251.txt" "b/caf\\303\\251.txt"
new file mode 100644
`);
    expect(file?.path).toBe("café.txt");
  });

  it('verwerkt \\", \\\\, \\t en \\n in een gequote pad', () => {
    expect(
      parseDiff(`diff --git "a/q\\"u\\\\o\\tt\\ne" "b/q\\"u\\\\o\\tt\\ne"\n`)[0]
        ?.path,
    ).toBe('q"u\\o\tt\ne');
  });

  it("herkent een rename met één gequote kant", () => {
    const [file] = parseDiff(
      `diff --git a/old.txt "b/n\\303\\251w.txt"\nsimilarity index 100%\n`,
    );
    expect(file?.path).toBe("néw.txt");
  });
});
