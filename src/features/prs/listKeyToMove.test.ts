import { describe, expect, it } from "vitest";
import { isTypingTarget, listKeyToMove } from "./listKeyToMove";

describe("listKeyToMove", () => {
  it("herkent de pijltjes", () => {
    expect(listKeyToMove("ArrowDown")).toBe(1);
    expect(listKeyToMove("ArrowUp")).toBe(-1);
  });

  it("herkent J/K als alternatief, hoofdletterongevoelig", () => {
    expect(listKeyToMove("j")).toBe(1);
    expect(listKeyToMove("J")).toBe(1);
    expect(listKeyToMove("k")).toBe(-1);
    expect(listKeyToMove("K")).toBe(-1);
  });

  it("geeft null voor elke andere toets", () => {
    expect(listKeyToMove("Enter")).toBeNull();
    expect(listKeyToMove("a")).toBeNull();
  });
});

describe("isTypingTarget", () => {
  it("is waar voor een input", () => {
    expect(isTypingTarget({ tagName: "INPUT", isContentEditable: false })).toBe(
      true,
    );
  });

  it("is waar voor een textarea (bv. het reactieveld in ReviewActions)", () => {
    expect(
      isTypingTarget({ tagName: "TEXTAREA", isContentEditable: false }),
    ).toBe(true);
  });

  it("is waar voor contenteditable", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: true })).toBe(
      true,
    );
  });

  it("is onwaar voor een gewoon element", () => {
    expect(isTypingTarget({ tagName: "DIV", isContentEditable: false })).toBe(
      false,
    );
  });

  it("is onwaar voor null", () => {
    expect(isTypingTarget(null)).toBe(false);
  });
});
