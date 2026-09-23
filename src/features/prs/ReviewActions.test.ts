import { describe, expect, it } from "vitest";
import { isApproveShortcut, reviewButtonsState } from "./ReviewActions";

const baseEvent = {
  key: "a",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
};

describe("reviewButtonsState", () => {
  it("staat goedkeuren toe zonder tekst", () => {
    expect(reviewButtonsState("", false).approveEnabled).toBe(true);
  });

  it("houdt changes vragen en reageren uit zonder tekst", () => {
    const state = reviewButtonsState("", false);
    expect(state.requestChangesEnabled).toBe(false);
    expect(state.commentEnabled).toBe(false);
  });

  it("houdt changes vragen en reageren uit bij alleen whitespace", () => {
    const state = reviewButtonsState("   ", false);
    expect(state.requestChangesEnabled).toBe(false);
    expect(state.commentEnabled).toBe(false);
  });

  it("zet changes vragen en reageren aan zodra er tekst is", () => {
    const state = reviewButtonsState("Kan dit anders?", false);
    expect(state.requestChangesEnabled).toBe(true);
    expect(state.commentEnabled).toBe(true);
  });

  it("zet alle drie uit terwijl er al een aanvraag loopt", () => {
    const state = reviewButtonsState("Kan dit anders?", true);
    expect(state).toEqual({
      approveEnabled: false,
      requestChangesEnabled: false,
      commentEnabled: false,
    });
  });
});

describe("isApproveShortcut", () => {
  it("herkent een kale A", () => {
    expect(isApproveShortcut(baseEvent)).toBe(true);
  });

  it("herkent hoofdletter A ook", () => {
    expect(isApproveShortcut({ ...baseEvent, key: "A" })).toBe(true);
  });

  it("negeert een herhaalde toets (ingedrukt houden)", () => {
    expect(isApproveShortcut({ ...baseEvent, repeat: true })).toBe(false);
  });

  it("negeert Shift+A", () => {
    expect(isApproveShortcut({ ...baseEvent, shiftKey: true })).toBe(false);
  });

  it("negeert Alt+A", () => {
    expect(isApproveShortcut({ ...baseEvent, altKey: true })).toBe(false);
  });

  it("negeert Meta+A en Ctrl+A", () => {
    expect(isApproveShortcut({ ...baseEvent, metaKey: true })).toBe(false);
    expect(isApproveShortcut({ ...baseEvent, ctrlKey: true })).toBe(false);
  });

  it("negeert een andere toets", () => {
    expect(isApproveShortcut({ ...baseEvent, key: "b" })).toBe(false);
  });
});
