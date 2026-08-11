import { describe, expect, it } from "vitest";
import { computeShortcutsEnabled } from "./Cockpit";

const base = {
  settingsOpen: false,
  sortOpen: false,
  contextMenuOpen: false,
  menuOverlayOpen: false,
  inspectorOpen: false,
};

describe("computeShortcutsEnabled", () => {
  it("staat shortcuts toe als niets open staat", () => {
    expect(computeShortcutsEnabled(base)).toBe(true);
  });

  it("blokkeert bij een open settings-sheet", () => {
    expect(computeShortcutsEnabled({ ...base, settingsOpen: true })).toBe(
      false,
    );
  });

  it("blokkeert bij een open sortmenu", () => {
    expect(computeShortcutsEnabled({ ...base, sortOpen: true })).toBe(false);
  });

  it("blokkeert bij een open contextmenu", () => {
    expect(computeShortcutsEnabled({ ...base, contextMenuOpen: true })).toBe(
      false,
    );
  });

  it("blokkeert bij een open merge- of agent-modusmenu (DOM-overlay)", () => {
    expect(computeShortcutsEnabled({ ...base, menuOverlayOpen: true })).toBe(
      false,
    );
  });

  it("blokkeert bij een open PR-inspector", () => {
    expect(computeShortcutsEnabled({ ...base, inspectorOpen: true })).toBe(
      false,
    );
  });
});
