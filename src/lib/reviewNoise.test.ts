import { afterEach, beforeEach, describe, expect, it } from "vitest";
import type { ReviewThread } from "./github/prDetail";
import {
  classifyThread,
  countNoise,
  parseNoise,
  prNoise,
  recordNoise,
  repoNoise,
} from "./reviewNoise";

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

function thread(
  isResolved: boolean,
  isOutdated: boolean,
  agentReview: ReviewThread["agentReview"],
): ReviewThread {
  return {
    id: "t",
    path: "a.ts",
    line: 1,
    diffSide: "RIGHT",
    isResolved,
    isOutdated,
    agentReview,
    viewerCanReply: true,
    viewerCanResolve: true,
    viewerCanUnresolve: false,
    comments: [],
  };
}

describe("classifyThread", () => {
  it("open als niet resolved, ook als verouderd", () => {
    expect(classifyThread(thread(false, false, "claude"))).toBe("open");
    expect(classifyThread(thread(false, true, "claude"))).toBe("open");
  });

  it("gefixt als resolved en verouderd", () => {
    expect(classifyThread(thread(true, true, "claude"))).toBe("gefixt");
  });

  it("weerlegd als resolved en niet verouderd", () => {
    expect(classifyThread(thread(true, false, "claude"))).toBe("weerlegd");
  });
});

describe("countNoise", () => {
  it("telt alleen threads van een agent-review", () => {
    expect(
      countNoise([
        thread(true, true, "claude"),
        thread(true, false, "codex"),
        thread(false, false, "codex"),
        thread(false, false, null),
        thread(true, true, null),
      ]),
    ).toEqual({ gefixt: 1, weerlegd: 1, open: 1 });
  });
});

describe("recordNoise / repoNoise", () => {
  it("overschrijft de entry van dezelfde PR in plaats van op te tellen", () => {
    recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
    recordNoise("a/b", 1, { gefixt: 2, weerlegd: 1, open: 0 });
    expect(repoNoise("a/b")).toEqual({
      prs: 1,
      counts: { gefixt: 2, weerlegd: 1, open: 0 },
    });
  });

  it("slaat een PR zonder agent-threads niet op en verwijdert een oude entry", () => {
    recordNoise("a/b", 1, { gefixt: 0, weerlegd: 0, open: 0 });
    expect(repoNoise("a/b").prs).toBe(0);
    recordNoise("a/b", 2, { gefixt: 1, weerlegd: 0, open: 0 });
    recordNoise("a/b", 2, { gefixt: 0, weerlegd: 0, open: 0 });
    expect(repoNoise("a/b").prs).toBe(0);
  });

  it("somt per repo en negeert andere repo's, ook met hetzelfde nummer", () => {
    recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 1 });
    recordNoise("a/b", 2, { gefixt: 2, weerlegd: 1, open: 0 });
    recordNoise("a/c", 1, { gefixt: 9, weerlegd: 9, open: 9 });
    expect(repoNoise("a/b")).toEqual({
      prs: 2,
      counts: { gefixt: 3, weerlegd: 1, open: 1 },
    });
  });

  it("geeft leeg bij corrupte JSON en herstelt bij de volgende record", () => {
    localStorage.setItem("pr-cockpit.reviewNoise", "{kapot");
    expect(repoNoise("a/b")).toEqual({
      prs: 0,
      counts: { gefixt: 0, weerlegd: 0, open: 0 },
    });
    recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
    expect(repoNoise("a/b").prs).toBe(1);
  });

  it("negeert entries met een ongeldige vorm", () => {
    localStorage.setItem(
      "pr-cockpit.reviewNoise",
      JSON.stringify({ "a/b#1": { gefixt: "x" }, "a/b#2": null }),
    );
    expect(repoNoise("a/b").prs).toBe(0);
  });

  describe("met een window", () => {
    const target = new EventTarget();
    beforeEach(() => {
      Object.defineProperty(globalThis, "window", {
        value: target,
        configurable: true,
      });
    });
    afterEach(() => {
      Reflect.deleteProperty(globalThis, "window");
    });

    function countEvents(): () => number {
      let fired = 0;
      target.addEventListener("pr-cockpit:review-noise", () => {
        fired += 1;
      });
      return () => fired;
    }

    it("vuurt een event bij een geslaagde opslag", () => {
      const fired = countEvents();
      recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
      expect(fired()).toBe(1);
    });

    it("schrijft niet en vuurt geen event bij gelijke counts", () => {
      recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
      const fired = countEvents();
      recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
      recordNoise("a/b", 2, { gefixt: 0, weerlegd: 0, open: 0 });
      expect(fired()).toBe(0);
      recordNoise("a/b", 1, { gefixt: 2, weerlegd: 0, open: 0 });
      expect(fired()).toBe(1);
    });
  });

  it("prNoise geeft de counts van een PR of null", () => {
    recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
    expect(prNoise("a/b", 1)).toEqual({ gefixt: 1, weerlegd: 0, open: 0 });
    expect(prNoise("a/b", 2)).toBeNull();
  });

  it("hergebruikt een al geparste opslag", () => {
    recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 });
    const all = parseNoise(localStorage.getItem("pr-cockpit.reviewNoise"));
    localStorage.clear();
    expect(prNoise("a/b", 1, all)).not.toBeNull();
    expect(repoNoise("a/b", all).prs).toBe(1);
  });

  it("gooit niet als localStorage zelf faalt", () => {
    Object.defineProperty(globalThis, "localStorage", {
      value: {
        getItem: () => {
          throw new Error("geblokkeerd");
        },
        setItem: () => {
          throw new Error("geblokkeerd");
        },
      },
      configurable: true,
    });
    expect(() =>
      recordNoise("a/b", 1, { gefixt: 1, weerlegd: 0, open: 0 }),
    ).not.toThrow();
    expect(repoNoise("a/b").prs).toBe(0);
  });
});
