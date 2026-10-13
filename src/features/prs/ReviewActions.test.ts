import { describe, expect, it } from "vitest";
import {
  isApproveShortcut,
  reviewButtonsState,
  reviewHint,
} from "./ReviewActions";

const baseEvent = {
  key: "a",
  metaKey: false,
  ctrlKey: false,
  altKey: false,
  shiftKey: false,
  repeat: false,
};

describe("reviewButtonsState", () => {
  const NEEDS_TEXT_CHANGES = "Een reactie is verplicht bij changes vragen";
  const NEEDS_TEXT_COMMENT =
    "Een reactie is verplicht bij reageren zonder opmerkingen op regels";

  it("staat goedkeuren toe zonder tekst en houdt de rest uit", () => {
    expect(reviewButtonsState("", false, 0, false)).toEqual({
      approveEnabled: true,
      requestChangesEnabled: false,
      commentEnabled: false,
      approveReason: null,
      requestChangesReason: NEEDS_TEXT_CHANGES,
      commentReason: NEEDS_TEXT_COMMENT,
    });
  });

  it("houdt changes vragen en reageren uit bij alleen whitespace", () => {
    const state = reviewButtonsState("   ", false, 0, false);
    expect(state.requestChangesEnabled).toBe(false);
    expect(state.commentEnabled).toBe(false);
  });

  it("zet changes vragen en reageren aan zodra er tekst is", () => {
    expect(reviewButtonsState("Kan dit anders?", false, 0, false)).toEqual({
      approveEnabled: true,
      requestChangesEnabled: true,
      commentEnabled: true,
      approveReason: null,
      requestChangesReason: null,
      commentReason: null,
    });
  });

  it("zet reageren aan zonder tekst zodra er concepten meegaan", () => {
    const state = reviewButtonsState("", false, 2, false);
    expect(state.commentEnabled).toBe(true);
    expect(state.commentReason).toBeNull();
  });

  it("houdt changes vragen uit zonder tekst, ook met concepten", () => {
    const state = reviewButtonsState("", false, 2, false);
    expect(state.requestChangesEnabled).toBe(false);
    expect(state.requestChangesReason).toBe(NEEDS_TEXT_CHANGES);
  });

  it("zet alle drie uit terwijl er al een aanvraag loopt", () => {
    expect(reviewButtonsState("Kan dit anders?", true, 0, false)).toEqual({
      approveEnabled: false,
      requestChangesEnabled: false,
      commentEnabled: false,
      approveReason: null,
      requestChangesReason: null,
      commentReason: null,
    });
  });

  it("laat op een eigen PR alleen reageren toe, met de reden erbij", () => {
    expect(reviewButtonsState("Hoi", false, 0, true)).toEqual({
      approveEnabled: false,
      requestChangesEnabled: false,
      commentEnabled: true,
      approveReason: "Je kunt je eigen PR niet goedkeuren",
      requestChangesReason: "Je kunt geen changes vragen op je eigen PR",
      commentReason: null,
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

describe("reviewHint", () => {
  it("zegt niets in ruststand: geen tekst en geen concepten", () => {
    expect(
      reviewHint(reviewButtonsState("", false, 0, false), "", 0),
    ).toBeNull();
  });

  it("noemt met concepten maar zonder tekst waarom changes vragen niet kan", () => {
    expect(reviewHint(reviewButtonsState("", false, 2, false), "", 2)).toBe(
      "Een reactie is verplicht bij changes vragen",
    );
  });

  it("noemt met tekst op een eigen PR waarom goedkeuren niet kan", () => {
    expect(
      reviewHint(reviewButtonsState("Hoi", false, 0, true), "Hoi", 0),
    ).toBe("Je kunt je eigen PR niet goedkeuren");
  });

  it("zegt niets als alles mag", () => {
    expect(
      reviewHint(reviewButtonsState("Hoi", false, 0, false), "Hoi", 0),
    ).toBeNull();
  });
});
