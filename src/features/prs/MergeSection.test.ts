import { beforeEach, describe, expect, it } from "vitest";
import { loadMethod } from "./MergeSection";

const STORAGE_KEY = "pr-cockpit.mergeMethod";

/** vitest draait in een node-omgeving zonder DOM: MergeSection.tsx gebruikt
 * localStorage direct, dus hier een minimale in-memory mock. */
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

describe("loadMethod", () => {
  it("valt terug op SQUASH voor een historische REBASE-waarde", () => {
    localStorage.setItem(STORAGE_KEY, "REBASE");
    expect(loadMethod()).toBe("SQUASH");
  });
});
