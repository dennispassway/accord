import { describe, expect, it } from "vitest";
import { setupMockFocusTracking } from "./windowFocus";

/** Minimale fake voor window/document: bewaart listeners per event-type en
 * kan ze op aanroep afvuren, net als een echte EventTarget. */
function fakeTarget() {
  const listeners = new Map<string, () => void>();
  return {
    addEventListener: (type: string, fn: () => void) => {
      listeners.set(type, fn);
    },
    removeEventListener: (type: string) => {
      listeners.delete(type);
    },
    fire: (type: string) => listeners.get(type)?.(),
    has: (type: string) => listeners.has(type),
  };
}

describe("setupMockFocusTracking", () => {
  it("zet de startwaarde meteen op basis van document.hasFocus()", () => {
    const win = fakeTarget();
    const doc = { ...fakeTarget(), hasFocus: () => false };
    let focused: boolean | undefined;
    setupMockFocusTracking(win, doc, (value) => {
      focused = value;
    });
    expect(focused).toBe(false);
  });

  it("herleest hasFocus() bij een tabwissel (visibilitychange), ook zonder window-blur", () => {
    // B: een tabwissel binnen hetzelfde browservenster vuurt geen
    // window-focus/blur, alleen visibilitychange. Zonder deze listener
    // blijft `focused` op de startwaarde hangen en meldt decideNotification
    // dus nooit iets (de VERIFIER-FAILED root cause).
    const win = fakeTarget();
    let hasFocus = true;
    const doc = { ...fakeTarget(), hasFocus: () => hasFocus };
    let focused: boolean | undefined;
    setupMockFocusTracking(win, doc, (value) => {
      focused = value;
    });
    expect(focused).toBe(true);

    hasFocus = false;
    doc.fire("visibilitychange");
    expect(focused).toBe(false);
  });

  it("herleest hasFocus() ook bij window-focus/blur", () => {
    const win = fakeTarget();
    let hasFocus = true;
    const doc = { ...fakeTarget(), hasFocus: () => hasFocus };
    let focused: boolean | undefined;
    setupMockFocusTracking(win, doc, (value) => {
      focused = value;
    });

    hasFocus = false;
    win.fire("blur");
    expect(focused).toBe(false);

    hasFocus = true;
    win.fire("focus");
    expect(focused).toBe(true);
  });

  it("verwijdert alle listeners bij cleanup", () => {
    const win = fakeTarget();
    const doc = { ...fakeTarget(), hasFocus: () => true };
    const cleanup = setupMockFocusTracking(win, doc, () => {});
    expect(win.has("focus")).toBe(true);
    expect(win.has("blur")).toBe(true);
    expect(doc.has("visibilitychange")).toBe(true);
    cleanup();
    expect(win.has("focus")).toBe(false);
    expect(win.has("blur")).toBe(false);
    expect(doc.has("visibilitychange")).toBe(false);
  });
});
