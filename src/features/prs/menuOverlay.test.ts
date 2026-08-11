import { describe, expect, it } from "vitest";
import type { QueryRoot } from "./menuOverlay";
import { isAnyMenuOverlayOpen } from "./menuOverlay";

function fakeRoot(hasOverlay: boolean): QueryRoot {
  return {
    querySelector: (selector: string) =>
      hasOverlay && selector === ".detail-merge-menu-overlay" ? {} : null,
  };
}

describe("isAnyMenuOverlayOpen", () => {
  it("is false zonder open menu", () => {
    expect(isAnyMenuOverlayOpen(fakeRoot(false))).toBe(false);
  });

  it("is true als de merge- of agent-modusmenu-overlay in de DOM staat", () => {
    expect(isAnyMenuOverlayOpen(fakeRoot(true))).toBe(true);
  });
});
