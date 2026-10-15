import { describe, expect, it } from "vitest";
import type { PrFile } from "../../lib/github/prFiles";
import { buildUnifiedItems, fileStatus } from "./diffModel";
import { diffFilesFromPrFiles } from "./prFilesDiff";

const patch = "@@ -1,2 +1,2 @@\n keep\n-oud\n+nieuw";

function status(file: PrFile): string | null {
  const [built] = diffFilesFromPrFiles([file]);
  return fileStatus(built?.lines ?? []);
}

describe("diffFilesFromPrFiles", () => {
  it("zet het pad en de patchregels per soort in een DiffFile", () => {
    const [file] = diffFilesFromPrFiles([
      { filename: "src/a.ts", status: "modified", changes: 2, patch },
    ]);
    expect(file?.path).toBe("src/a.ts");
    expect(file?.lines.map((l) => l.kind)).toEqual([
      "hunk",
      "context",
      "del",
      "add",
    ]);
    expect(buildUnifiedItems(file?.lines ?? []).length).toBe(4);
  });

  it("neemt het pad letterlijk over, ook met spaties, quotes, backslash en newline", () => {
    const paths = ["a b.ts", 'we"ird.ts', "back\\slash.ts", "new\nline.ts"];
    const files = diffFilesFromPrFiles(
      paths.map((filename) => ({
        filename,
        status: "modified",
        changes: 2,
        patch,
      })),
    );
    expect(files.map((f) => f.path)).toEqual(paths);
  });

  it("meldt een hernoeming met het oorspronkelijke pad, ook bij bijzondere tekens", () => {
    for (const from of ["old name.ts", 'q"uote.ts', "b\\s.ts", "n\nl.ts"]) {
      expect(
        status({
          filename: "new.ts",
          status: "renamed",
          changes: 0,
          previous_filename: from,
        }),
      ).toBe(`Hernoemd van ${from}`);
    }
  });

  it("meldt een kopie als gekopieerd", () => {
    expect(
      status({
        filename: "b.ts",
        status: "copied",
        changes: 0,
        previous_filename: "a.ts",
      }),
    ).toBe("Gekopieerd van a.ts");
  });

  it("behoudt de patch van een hernoeming met wijzigingen", () => {
    const [file] = diffFilesFromPrFiles([
      {
        filename: "b.ts",
        status: "renamed",
        changes: 2,
        patch,
        previous_filename: "a.ts",
      },
    ]);
    expect(file?.lines.some((l) => l.kind === "hunk")).toBe(true);
    expect(fileStatus(file?.lines ?? [])).toBeNull();
  });

  it("markeert een bestand zonder patch maar met wijzigingen als te groot", () => {
    expect(
      status({ filename: "big.json", status: "modified", changes: 9000 }),
    ).toBe("Te groot om te tonen");
  });

  it("markeert een gewijzigd bestand zonder patch en zonder wijzigingen als binair", () => {
    expect(
      status({ filename: "logo.png", status: "modified", changes: 0 }),
    ).toBe("Binair bestand");
  });

  it("noemt een toegevoegd bestand alleen leeg bij de sha van de lege blob", () => {
    expect(
      status({
        filename: "e.txt",
        status: "added",
        changes: 0,
        sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      }),
    ).toBe("Leeg bestand toegevoegd");
  });

  it("noemt een toegevoegd bestand zonder tekstdiff en met een andere sha neutraal", () => {
    expect(
      status({
        filename: "logo.png",
        status: "added",
        changes: 0,
        sha: "0123456789abcdef0123456789abcdef01234567",
      }),
    ).toBe("Geen tekstdiff (binair of leeg)");
    expect(status({ filename: "x.bin", status: "added", changes: 0 })).toBe(
      "Geen tekstdiff (binair of leeg)",
    );
  });

  it("noemt een verwijderd bestand zonder patch neutraal", () => {
    expect(
      status({
        filename: "logo.png",
        status: "removed",
        changes: 0,
        sha: "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391",
      }),
    ).toBe("Geen tekstdiff (binair of leeg)");
  });

  it("meldt een alleen-rechten-wijziging met een eigen tekst", () => {
    expect(status({ filename: "run.sh", status: "changed", changes: 0 })).toBe(
      "Alleen bestandsrechten gewijzigd",
    );
  });
});
