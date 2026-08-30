import { beforeEach, describe, expect, it } from "vitest";
import {
  CLAUDE_MODELS,
  CODEX_MODELS,
  claudeModels,
  codexModels,
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  withCurrent,
} from "./settings";

/** vitest draait in een node-omgeving zonder DOM: settings.ts gebruikt
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

describe("loadSettings", () => {
  it("geeft de defaults terug als er niets is opgeslagen", () => {
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("geeft de defaults terug bij corrupte JSON", () => {
    localStorage.setItem("pr-cockpit.settings", "{niet-geldig-json");
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("geeft de defaults terug bij een ander versieveld", () => {
    localStorage.setItem(
      "pr-cockpit.settings",
      JSON.stringify({ ...DEFAULT_SETTINGS, version: 999 }),
    );
    expect(loadSettings()).toEqual(DEFAULT_SETTINGS);
  });

  it("vult ontbrekende velden aan met defaults", () => {
    localStorage.setItem(
      "pr-cockpit.settings",
      JSON.stringify({ version: 2, claude: { model: "opus" } }),
    );
    const settings = loadSettings();
    expect(settings.claude).toEqual({
      model: "opus",
      effort: DEFAULT_SETTINGS.claude.effort,
    });
    expect(settings.codex).toEqual(DEFAULT_SETTINGS.codex);
    expect(settings.review).toEqual(DEFAULT_SETTINGS.review);
  });

  it("leest terug wat saveSettings heeft weggeschreven", () => {
    const custom = {
      ...DEFAULT_SETTINGS,
      claude: { model: "haiku" as const, effort: "hoog" as const },
      review: { ...DEFAULT_SETTINGS.review, timeoutMinutes: 10 },
    };
    saveSettings(custom);
    expect(loadSettings()).toEqual(custom);
  });
});

describe("theme", () => {
  it("staat standaard op system", () => {
    expect(loadSettings().theme).toBe("system");
  });

  it("rondt light en dark om via save en load", () => {
    saveSettings({ ...DEFAULT_SETTINGS, theme: "dark" });
    expect(loadSettings().theme).toBe("dark");
    saveSettings({ ...DEFAULT_SETTINGS, theme: "light" });
    expect(loadSettings().theme).toBe("light");
  });

  it.each([null, undefined, "", "sepia"])(
    "valt bij %j terug op system",
    (value) => {
      localStorage.setItem(
        "pr-cockpit.settings",
        JSON.stringify({ ...DEFAULT_SETTINGS, theme: value }),
      );
      expect(loadSettings().theme).toBe("system");
    },
  );
});

describe("autoRebaseStacks", () => {
  it("staat standaard aan", () => {
    expect(loadSettings().autoRebaseStacks).toBe(true);
  });

  it("rondt uit en aan om via save en load", () => {
    saveSettings({ ...DEFAULT_SETTINGS, autoRebaseStacks: false });
    expect(loadSettings().autoRebaseStacks).toBe(false);
    saveSettings({ ...DEFAULT_SETTINGS, autoRebaseStacks: true });
    expect(loadSettings().autoRebaseStacks).toBe(true);
  });

  it("vult het veld aan met de default als het ontbreekt", () => {
    localStorage.setItem(
      "pr-cockpit.settings",
      JSON.stringify({ version: 2, claude: { model: "opus" } }),
    );
    expect(loadSettings().autoRebaseStacks).toBe(true);
  });

  it.each([null, undefined, "", "ja"])(
    "valt bij %j terug op de default",
    (value) => {
      localStorage.setItem(
        "pr-cockpit.settings",
        JSON.stringify({ ...DEFAULT_SETTINGS, autoRebaseStacks: value }),
      );
      expect(loadSettings().autoRebaseStacks).toBe(true);
    },
  );
});

describe("modellijsten", () => {
  it("vult de claude-aliassen uit de CLI aan met de fallback", () => {
    expect(claudeModels(["fable", "opus", "sonnet"])).toEqual([
      "fable",
      "opus",
      "sonnet",
      "haiku",
    ]);
  });

  it("valt voor claude terug op de fallback als de CLI niets geeft", () => {
    expect(claudeModels([])).toEqual([...CLAUDE_MODELS]);
  });

  it("laat de codex-catalogus de fallback vervangen", () => {
    expect(codexModels(["gpt-5.6-sol", "gpt-5.5"])).toEqual([
      "gpt-5.6-sol",
      "gpt-5.5",
    ]);
  });

  it("valt voor codex terug op de fallback bij een lege catalogus", () => {
    expect(codexModels([])).toEqual([...CODEX_MODELS]);
  });

  it("houdt een opgeslagen model dat de CLI niet kent kiesbaar", () => {
    expect(withCurrent(["gpt-5.6-sol"], "gpt-5-codex")).toEqual([
      "gpt-5.6-sol",
      "gpt-5-codex",
    ]);
  });

  it("voegt niets toe als het opgeslagen model al in de lijst staat", () => {
    expect(withCurrent(["gpt-5.6-sol"], "gpt-5.6-sol")).toEqual([
      "gpt-5.6-sol",
    ]);
  });
});
