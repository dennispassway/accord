import { beforeEach, describe, expect, it } from "vitest";
import { parseDiff } from "./diffParse";
import {
  createDraftStore,
  type DraftStore,
  draftsOutsideDiff,
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

describe("createDraftStore", () => {
  let n = 0;
  const fixedNow = () => new Date("2026-10-13T09:00:00.000Z");
  const make = (
    persistence = { load: loadDrafts, save: saveDrafts },
  ): DraftStore => {
    n = 0;
    return createDraftStore(persistence, () => `id${++n}`, fixedNow);
  };
  const input = { path: "a.ts", line: 3, side: "RIGHT" as const, body: "Kijk" };

  it("voegt toe met id en createdAt en bewaart het", () => {
    const store = make();
    const added = store.add("r#1", input);
    expect(added).toEqual({
      id: "id1",
      ...input,
      createdAt: "2026-10-13T09:00:00.000Z",
    });
    expect(store.get("r#1")).toEqual([added]);
    expect(loadDrafts("r#1")).toEqual([added]);
  });

  it("weigert een lege of witruimte-opmerking", () => {
    const store = make();
    expect(store.add("r#1", { ...input, body: "  " })).toBeNull();
    expect(store.get("r#1")).toEqual([]);
  });

  it("geeft dezelfde array terug zolang er niets verandert", () => {
    const store = make();
    store.add("r#1", input);
    expect(store.get("r#1")).toBe(store.get("r#1"));
    expect(store.get("r#2")).toBe(store.get("r#2"));
  });

  it("leest bij de eerste toegang uit de opslag", () => {
    saveDrafts("r#1", [draft()]);
    expect(make().get("r#1")).toEqual([draft()]);
  });

  it("past de tekst van één concept aan en laat de rest staan", () => {
    const store = make();
    store.add("r#1", input);
    store.add("r#1", { ...input, line: 4 });
    store.edit("r#1", "id1", "Anders");
    expect(store.get("r#1").map((d) => d.body)).toEqual(["Anders", "Kijk"]);
  });

  it("maakt geen nieuw object en meldt niets als de tekst gelijk blijft", () => {
    const store = make();
    store.add("r#1", input);
    const before = store.get("r#1");
    let calls = 0;
    store.subscribe("r#1", () => calls++);
    store.edit("r#1", "id1", "Kijk");
    expect(store.get("r#1")).toBe(before);
    expect(store.get("r#1")[0]).toBe(before[0]);
    expect(calls).toBe(0);
  });

  it("negeert een bewerking naar een lege tekst", () => {
    const store = make();
    store.add("r#1", input);
    store.edit("r#1", "id1", " ");
    expect(store.get("r#1")[0]?.body).toBe("Kijk");
  });

  it("verwijdert alleen de genoemde ids", () => {
    const store = make();
    store.add("r#1", input);
    store.add("r#1", { ...input, line: 4 });
    store.add("r#1", { ...input, line: 5 });
    store.remove("r#1", ["id1", "id3"]);
    expect(store.get("r#1").map((d) => d.id)).toEqual(["id2"]);
  });

  it("verwijdert met removeIfUnchanged alleen concepten die nog hetzelfde object zijn", () => {
    const store = make();
    store.add("r#1", input);
    store.add("r#1", { ...input, line: 4 });
    const sent = store.get("r#1");
    store.edit("r#1", "id1", "bewerkt");
    store.removeIfUnchanged("r#1", sent);
    expect(store.get("r#1").map((d) => d.body)).toEqual(["bewerkt"]);
  });

  it("telt de concepten buiten de diff die de inspector heeft gemeld", () => {
    const store = make();
    store.add("r#1", input);
    store.add("r#1", { ...input, line: 4 });
    expect(store.outsideCount("r#1")).toBe(0);
    let calls = 0;
    store.subscribe("r#1", () => calls++);
    store.setOutside("r#1", new Set(["id2", "bestaat-niet"]));
    expect(store.outsideCount("r#1")).toBe(1);
    expect(calls).toBe(1);
    store.remove("r#1", ["id2"]);
    expect(store.outsideCount("r#1")).toBe(0);
    expect(store.outsideCount("r#2")).toBe(0);
  });

  it("wist alles van één PR en laat een andere PR met hetzelfde nummer staan", () => {
    const store = make();
    store.add("a/x#1", input);
    store.add("b/x#1", input);
    store.clear("a/x#1");
    expect(store.get("a/x#1")).toEqual([]);
    expect(store.get("b/x#1")).toHaveLength(1);
    expect(loadDrafts("a/x#1")).toEqual([]);
  });

  it("meldt alleen de luisteraars van die PR, en niet meer na afmelden", () => {
    const store = make();
    const mine: string[] = [];
    const other: string[] = [];
    const off = store.subscribe("r#1", () => mine.push("x"));
    store.subscribe("r#2", () => other.push("x"));
    store.add("r#1", input);
    expect(mine).toHaveLength(1);
    expect(other).toHaveLength(0);
    off();
    store.add("r#1", { ...input, line: 9 });
    expect(mine).toHaveLength(1);
  });

  it("meldt niets bij een verwijdering van een onbekend id", () => {
    const store = make();
    store.add("r#1", input);
    let calls = 0;
    store.subscribe("r#1", () => calls++);
    store.remove("r#1", ["bestaat-niet"]);
    expect(calls).toBe(0);
  });

  it("houdt de concepten in het geheugen als opslaan faalt", () => {
    const store = make({
      load: () => [],
      save: () => {
        throw new Error("vol");
      },
    });
    expect(() => store.add("r#1", input)).not.toThrow();
    expect(store.get("r#1")).toHaveLength(1);
  });
});

describe("draftsOutsideDiff", () => {
  const files = parseDiff(`diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -10,3 +10,3 @@
 keep
-oud
+nieuw
 end
`);
  const at = (over: Partial<ReviewDraft>) => draft({ path: "a.ts", ...over });

  it("herkent concepten op toegevoegde, verwijderde en contextregels", () => {
    const drafts = [
      at({ id: "add", line: 11, side: "RIGHT" }),
      at({ id: "del", line: 11, side: "LEFT" }),
      at({ id: "ctx", line: 10, side: "RIGHT" }),
    ];
    expect(draftsOutsideDiff(drafts, files).size).toBe(0);
  });

  it("markeert een regel buiten de hunks", () => {
    const out = draftsOutsideDiff([at({ id: "x", line: 99 })], files);
    expect([...out]).toEqual(["x"]);
  });

  it("markeert een RIGHT-concept voorbij de laatste nieuwe regel", () => {
    // De nieuwe kant loopt tot en met regel 12.
    expect([...draftsOutsideDiff([at({ id: "x", line: 13 })], files)]).toEqual([
      "x",
    ]);
  });

  it("markeert een bestand dat niet in de diff zit", () => {
    const out = draftsOutsideDiff([at({ id: "x", path: "weg.ts" })], files);
    expect([...out]).toEqual(["x"]);
  });
});
