import { describe, expect, it } from "vitest";
import { mockFileLines } from "./fileLines";

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
