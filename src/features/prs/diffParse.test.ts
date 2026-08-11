import { describe, expect, it } from "vitest";
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
});
