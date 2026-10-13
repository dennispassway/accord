import { beforeEach, describe, expect, it } from "vitest";
import {
  draftsToThreads,
  loadDrafts,
  type ReviewDraft,
  saveDrafts,
} from "./reviewDrafts";

/** Node-omgeving zonder DOM: minimale in-memory localStorage (patroon uit cockpitPrefs.test.ts). */
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

const draft = (over: Partial<ReviewDraft> = {}): ReviewDraft => ({
  id: "d1",
  path: "src/a.ts",
  line: 7,
  side: "RIGHT",
  body: "Let hierop",
  createdAt: "2026-10-12T10:00:00.000Z",
  ...over,
});

const KEY = "pr-cockpit.reviewDrafts.acme/a#42";

describe("loadDrafts / saveDrafts", () => {
  it("geeft een lege lijst zonder opslag", () => {
    expect(loadDrafts("acme/a#42")).toEqual([]);
  });

  it("leest terug wat is opgeslagen", () => {
    saveDrafts("acme/a#42", [draft(), draft({ id: "d2", side: "LEFT" })]);
    expect(loadDrafts("acme/a#42")).toEqual([
      draft(),
      draft({ id: "d2", side: "LEFT" }),
    ]);
  });

  it("gebruikt de sleutel pr-cockpit.reviewDrafts.<prKey>", () => {
    saveDrafts("acme/a#42", [draft()]);
    expect(localStorage.getItem(KEY)).not.toBeNull();
  });

  it("verwijdert de sleutel bij een lege lijst", () => {
    saveDrafts("acme/a#42", [draft()]);
    saveDrafts("acme/a#42", []);
    expect(localStorage.getItem(KEY)).toBeNull();
  });

  it("houdt acme/a#42 en acme/b#42 gescheiden", () => {
    saveDrafts("acme/a#42", [draft({ body: "voor a" })]);
    expect(loadDrafts("acme/b#42")).toEqual([]);
    saveDrafts("acme/b#42", [draft({ id: "x", body: "voor b" })]);
    expect(loadDrafts("acme/a#42").map((d) => d.body)).toEqual(["voor a"]);
    expect(loadDrafts("acme/b#42").map((d) => d.body)).toEqual(["voor b"]);
  });

  it("geeft een lege lijst bij corrupte JSON", () => {
    localStorage.setItem(KEY, "{niet json");
    expect(loadDrafts("acme/a#42")).toEqual([]);
  });

  it("geeft een lege lijst als de waarde geen array is", () => {
    localStorage.setItem(KEY, JSON.stringify({ a: 1 }));
    expect(loadDrafts("acme/a#42")).toEqual([]);
  });

  it("laat entries met verkeerde velden weg en houdt de goede", () => {
    localStorage.setItem(
      KEY,
      JSON.stringify([
        draft(),
        null,
        "tekst",
        draft({ id: "s", side: "MIDDEN" as never }),
        draft({ id: "t", side: "toString" as never }),
        { ...draft({ id: "l" }), line: "7" },
        { ...draft({ id: "b" }), body: 5 },
        { ...draft({ id: "p" }), path: undefined },
        { ...draft({ id: "i" }), id: 3 },
        { ...draft({ id: "c" }), createdAt: undefined },
      ]),
    );
    expect(loadDrafts("acme/a#42")).toEqual([draft()]);
  });
});

describe("draftsToThreads", () => {
  it("neemt alleen path, line, side en body over", () => {
    expect(draftsToThreads([draft()])).toEqual([
      { path: "src/a.ts", line: 7, side: "RIGHT", body: "Let hierop" },
    ]);
  });

  it("geeft een lege lijst voor geen concepten", () => {
    expect(draftsToThreads([])).toEqual([]);
  });
});
