import { beforeEach, describe, expect, it } from "vitest";
import {
  loadRepoFilter,
  loadSortMode,
  saveRepoFilter,
  saveSortMode,
} from "./cockpitPrefs";

/** vitest draait in een node-omgeving zonder DOM: cockpitPrefs.ts gebruikt
 * localStorage direct, dus hier een minimale in-memory mock (patroon uit
 * src/lib/settings.test.ts). */
class MemoryStorage implements Storage {
  private store = new Map<string, string>();
  get length() {
    return this.store.size;
  }
  clear() {
    this.store.clear();
  }
  getItem(key: string) {
    return this.store.get(key) ?? null;
  }
  key(index: number) {
    return [...this.store.keys()][index] ?? null;
  }
  removeItem(key: string) {
    this.store.delete(key);
  }
  setItem(key: string, value: string) {
    this.store.set(key, value);
  }
}

beforeEach(() => {
  Object.defineProperty(globalThis, "localStorage", {
    value: new MemoryStorage(),
    configurable: true,
  });
});

describe("loadSortMode", () => {
  it("geeft een geldige opgeslagen sortmode terug", () => {
    localStorage.setItem("pr-cockpit.sortMode", "omvang");
    expect(loadSortMode()).toBe("omvang");
  });

  it("valt terug op triage bij een onbekende waarde", () => {
    localStorage.setItem("pr-cockpit.sortMode", "onzin");
    expect(loadSortMode()).toBe("triage");
  });

  it("valt terug op triage bij lege storage", () => {
    expect(loadSortMode()).toBe("triage");
  });
});

describe("loadRepoFilter", () => {
  it("geeft de opgeslagen repo-filter terug", () => {
    localStorage.setItem("pr-cockpit.repoFilter", "acme/website");
    expect(loadRepoFilter()).toBe("acme/website");
  });

  it("geeft 'all' terug bij lege storage", () => {
    expect(loadRepoFilter()).toBe("all");
  });
});

describe("saveSortMode/saveRepoFilter", () => {
  it("schrijft de sortmode weg zodat loadSortMode 'm teruggeeft", () => {
    saveSortMode("project");
    expect(loadSortMode()).toBe("project");
  });

  it("schrijft de repo-filter weg zodat loadRepoFilter 'm teruggeeft", () => {
    saveRepoFilter("acme/api");
    expect(loadRepoFilter()).toBe("acme/api");
  });
});
