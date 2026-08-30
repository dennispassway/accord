import { useCallback, useEffect, useState } from "react";
import type { ReviewMode } from "../features/agents/crossReview";
import { applyTheme, type Theme } from "./theme";

export type Effort = "laag" | "midden" | "hoog";

/** Fallback zolang de CLI niets bruikbaars teruggeeft (niet geïnstalleerd,
 * time-out, of een uitvoer die we niet kunnen lezen). Zie `agentModels.ts`. */
export const CLAUDE_MODELS = ["haiku", "sonnet", "opus"] as const;
export const CODEX_MODELS = ["gpt-5.6-sol", "gpt-5.5", "gpt-5.4-mini"] as const;
export const EFFORTS: Effort[] = ["laag", "midden", "hoog"];
export const TIMEOUT_OPTIONS = [5, 10, 20, 30] as const;
export const REFRESH_OPTIONS = [1, 5, 15, 0] as const;

/** De codex-CLI levert een volledige catalogus, dus die vervangt de fallback.
 * `claude --help` noemt maar een paar aliassen als voorbeeld en is dus niet
 * uitputtend: daar vullen de gevonden aliassen de fallback aan. */
export function claudeModels(fromCli: readonly string[]): string[] {
  return [...fromCli, ...CLAUDE_MODELS.filter((m) => !fromCli.includes(m))];
}

export function codexModels(fromCli: readonly string[]): string[] {
  return fromCli.length > 0 ? [...fromCli] : [...CODEX_MODELS];
}

/** Een opgeslagen keuze die de CLI niet (meer) kent blijft kiesbaar; stil
 * terugzetten naar een ander model verbergt dat er iets veranderd is. */
export function withCurrent(options: string[], current: string): string[] {
  return options.includes(current) ? options : [...options, current];
}

interface AgentSettings {
  /** Vrije string: de lijst komt uit de CLI, niet uit een vaste union. */
  model: string;
  effort: Effort;
}

interface ReviewSettings {
  primaryMode: ReviewMode;
  /** 0 = handmatig verversen. */
  refreshMinutes: number;
  timeoutMinutes: number;
}

export interface Settings {
  version: 2;
  claude: AgentSettings;
  codex: AgentSettings;
  review: ReviewSettings;
  theme: Theme;
  /** Rebaset PR's die op een net gemergde PR stapelen automatisch op de
   * nieuwe base. */
  autoRebaseStacks: boolean;
}

const STORAGE_KEY = "pr-cockpit.settings";
const VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  version: VERSION,
  claude: { model: "sonnet", effort: "midden" },
  codex: { model: "gpt-5.6-sol", effort: "midden" },
  review: {
    primaryMode: "commentsOnly",
    refreshMinutes: 5,
    timeoutMinutes: 20,
  },
  theme: "system",
  autoRebaseStacks: true,
};

/** null, undefined, lege string of een onbekende waarde vallen terug op
 * "system"; een verplicht veld komt bij oudere/corrupte opslag vaak als "" binnen. */
function normalizeTheme(value: unknown): Theme {
  return value === "light" || value === "dark" ? value : "system";
}

/** null, undefined of een niet-boolean waarde vallen terug op de default. */
function normalizeAutoRebaseStacks(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_SETTINGS.autoRebaseStacks;
}

/** Leest settings uit localStorage; valt terug op de defaults bij ontbrekende
 * data, corrupte JSON of een ander versieveld, en vult ontbrekende velden aan. */
export function loadSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Partial<Settings>;
    if (parsed.version !== VERSION) return DEFAULT_SETTINGS;
    return {
      version: VERSION,
      claude: { ...DEFAULT_SETTINGS.claude, ...parsed.claude },
      codex: { ...DEFAULT_SETTINGS.codex, ...parsed.codex },
      review: { ...DEFAULT_SETTINGS.review, ...parsed.review },
      theme: normalizeTheme(parsed.theme),
      autoRebaseStacks: normalizeAutoRebaseStacks(parsed.autoRebaseStacks),
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}

export function saveSettings(settings: Settings): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
}

/** Houdt settings in React-state en schrijft elke wijziging meteen weg. */
export function useSettings() {
  const [settings, setSettings] = useState<Settings>(loadSettings);

  const update = useCallback((updater: (current: Settings) => Settings) => {
    setSettings((current) => {
      const next = updater(current);
      saveSettings(next);
      return next;
    });
  }, []);

  // Past het thema toe zodra settings geladen zijn en bij elke wissel.
  useEffect(() => {
    applyTheme(settings.theme);
  }, [settings.theme]);

  return { settings, update };
}
