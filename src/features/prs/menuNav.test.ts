import { describe, expect, it } from "vitest";
import { nextMenuIndex } from "./menuNav";

describe("nextMenuIndex", () => {
  it("gaat één op bij ArrowDown", () => {
    expect(nextMenuIndex(0, 1, 3)).toBe(1);
  });

  it("gaat één terug bij ArrowUp", () => {
    expect(nextMenuIndex(1, -1, 3)).toBe(0);
  });

  it("wrapt van laatste naar eerste bij ArrowDown", () => {
    expect(nextMenuIndex(2, 1, 3)).toBe(0);
  });

  it("wrapt van eerste naar laatste bij ArrowUp", () => {
    expect(nextMenuIndex(0, -1, 3)).toBe(2);
  });

  it("levert -1 als er geen items zijn", () => {
    expect(nextMenuIndex(0, 1, 0)).toBe(-1);
  });

  it("slaat een disabled item over bij ArrowDown", () => {
    // index 1 (bv. "Merge" op een niet-mergebare PR) ligt disabled: vanaf
    // index 0 moet de eerste ArrowDown al naar index 2 springen.
    expect(nextMenuIndex(0, 1, 3, [false, true, false])).toBe(2);
  });

  it("slaat een disabled item over bij ArrowUp", () => {
    expect(nextMenuIndex(2, -1, 3, [false, true, false])).toBe(0);
  });

  it("blijft op de huidige index als alle items disabled zijn", () => {
    expect(nextMenuIndex(0, 1, 3, [true, true, true])).toBe(0);
  });
});
