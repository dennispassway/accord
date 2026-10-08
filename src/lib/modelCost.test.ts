import { describe, expect, it } from "vitest";
import { costFactor, formatCostFactor } from "./modelCost";

describe("costFactor", () => {
  it.each([
    ["claude-fable-5-1", 2.5],
    ["sonnet", 0.5],
    ["claude-haiku-4-5", 0.25],
    ["opus", 1],
    ["Claude-Opus-4-1", 1],
  ])("%s -> %s", (model, factor) => {
    expect(costFactor(model)).toBe(factor);
  });

  it("geeft undefined voor een onbekend model", () => {
    expect(costFactor("gpt-5.5")).toBeUndefined();
  });

  it("formatteert met Nederlandse komma", () => {
    expect(formatCostFactor(2.5)).toBe("×2,5");
    expect(formatCostFactor(1)).toBe("×1");
    expect(formatCostFactor(0.25)).toBe("×0,25");
  });
});
