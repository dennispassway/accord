import { describe, expect, it } from "vitest";
import { mockFileLines, newSideLines } from "./fileLines";

describe("newSideLines", () => {
  const diff = [
    "diff --git a/a.ts b/a.ts",
    "--- a/a.ts",
    "+++ b/a.ts",
    "@@ -3,3 +3,3 @@",
    " keep",
    "-oud",
    "+nieuw",
    " end",
    "diff --git a/b.ts b/b.ts",
    "--- a/b.ts",
    "+++ b/b.ts",
    "@@ -1 +1 @@",
    "-x",
    "+y",
  ].join("\n");

  it("geeft alleen de nieuwe kant van het gevraagde bestand per regelnummer", () => {
    expect([...newSideLines(diff, "a.ts")]).toEqual([
      [3, "keep"],
      [4, "nieuw"],
      [5, "end"],
    ]);
  });

  it("geeft niets voor een onbekend pad", () => {
    expect(newSideLines(diff, "nope.ts").size).toBe(0);
  });
});

describe("mockFileLines", () => {
  it("vult het bestand aan tot 40 regels met synthetische regels", () => {
    const lines = mockFileLines(new Map([[3, "const a = 1;"]]));
    expect(lines).toHaveLength(40);
    expect(lines[0]).toBe("// regel 1");
    expect(lines[2]).toBe("const a = 1;");
    expect(lines[39]).toBe("// regel 40");
  });

  it("houdt de bekende regels op hun nummer, ook voorbij 40", () => {
    const lines = mockFileLines(new Map([[60, "export {};"]]));
    expect(lines[59]).toBe("export {};");
    expect(lines.length).toBeGreaterThan(60);
  });
});
