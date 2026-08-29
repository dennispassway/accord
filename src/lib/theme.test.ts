import { beforeEach, describe, expect, it } from "vitest";
import { applyTheme } from "./theme";

/** Geen jsdom in dit project: een minimale stub voor <html> en matchMedia,
 * in dezelfde stijl als de MemoryStorage-mock in settings.test.ts. */
class FakeMediaQueryList {
  matches: boolean;
  private listeners: Array<() => void> = [];
  constructor(matches: boolean) {
    this.matches = matches;
  }
  addEventListener(_type: "change", listener: () => void) {
    this.listeners.push(listener);
  }
  removeEventListener(_type: "change", listener: () => void) {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }
  fireChange(matches: boolean) {
    this.matches = matches;
    for (const listener of this.listeners) listener();
  }
  get listenerCount() {
    return this.listeners.length;
  }
}

let fakeMedia: FakeMediaQueryList;

beforeEach(() => {
  fakeMedia = new FakeMediaQueryList(false);
  Object.defineProperty(globalThis, "document", {
    value: { documentElement: { dataset: {} as Record<string, string> } },
    configurable: true,
  });
  Object.defineProperty(globalThis, "window", {
    value: { matchMedia: () => fakeMedia },
    configurable: true,
  });
});

describe("applyTheme", () => {
  it("zet een hard thema direct op dataset.theme", () => {
    applyTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    applyTheme("light");
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("volgt bij system de actuele prefers-color-scheme", () => {
    fakeMedia = new FakeMediaQueryList(true);
    Object.defineProperty(globalThis, "window", {
      value: { matchMedia: () => fakeMedia },
      configurable: true,
    });
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("werkt live bij een OS-wissel zolang system actief is", () => {
    applyTheme("system");
    expect(document.documentElement.dataset.theme).toBe("light");
    fakeMedia.fireChange(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("ruimt de matchMedia-listener op zodra een hard thema gekozen wordt", () => {
    applyTheme("system");
    expect(fakeMedia.listenerCount).toBe(1);
    applyTheme("dark");
    expect(fakeMedia.listenerCount).toBe(0);
    fakeMedia.fireChange(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
