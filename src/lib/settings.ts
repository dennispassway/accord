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
  /** Model voor het leeswerk (mode `commentsOnly`), los van het model voor
   * fixwerk: een review zonder code-wijzigingen hoeft niet op hetzelfde
   * zware model te draaien. Leeg of ontbrekend valt terug op `model`. */
  commentsOnlyModel: string;
  effort: Effort;
}

interface ReviewSettings {
  primaryMode: ReviewMode;
  /** 0 = handmatig verversen. */
  refreshMinutes: number;
  timeoutMinutes: number;
}

export interface Settings {
  version: 3;
  claude: AgentSettings;
  codex: AgentSettings;
  review: ReviewSettings;
  theme: Theme;
  /** Rebaset PR's die op een net gemergde PR stapelen automatisch op de
   * nieuwe base. */
  autoRebaseStacks: boolean;
  /** Systeemnotificaties (agent-run klaar/mislukt, CI-omslag, merge), alleen
   * als het venster niet gefocust is. */
  notifications: boolean;
}

const STORAGE_KEY = "pr-cockpit.settings";
const VERSION = 3;
/** Versie 2 kende `commentsOnlyModel` nog niet; `normalizeAgent` vult dat aan,
 * dus die opslag gooien we niet weg voor één ontbrekend veld. */
const MIGRATABLE_VERSION = 2;

export const DEFAULT_SETTINGS: Settings = {
  version: VERSION,
  claude: { model: "sonnet", commentsOnlyModel: "haiku", effort: "midden" },
  codex: {
    model: "gpt-5.6-sol",
    commentsOnlyModel: "gpt-5.4-mini",
    effort: "midden",
  },
  review: {
    primaryMode: "commentsOnly",
    refreshMinutes: 5,
    timeoutMinutes: 20,
  },
  theme: "system",
  autoRebaseStacks: true,
  notifications: true,
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

/** null, undefined, lege string of een ander type vallen terug op de default
 * (aan): alleen een echte boolean overschrijft 'm. */
function normalizeNotifications(value: unknown): boolean {
  return typeof value === "boolean" ? value : DEFAULT_SETTINGS.notifications;
}

/** Vult een opgeslagen agent aan. Een ontbrekend, leeg of null `commentsOnlyModel`
 * (versie 2 kende het veld niet, en een verplicht stringveld komt ook als ""
 * terug) volgt het model dat de gebruiker wél koos, niet de default. */
function normalizeAgent(
  stored: Partial<AgentSettings> | undefined,
  fallback: AgentSettings,
): AgentSettings {
  // Staat er niets, dan koos de gebruiker ook niets: dan geldt de hele default,
  // inclusief het lichtere leesmodel.
  if (stored == null) return fallback;
  const model = stored.model || fallback.model;
  return {
    ...fallback,
    ...stored,
    model,
    commentsOnlyModel: stored.commentsOnlyModel || model,
  };
}

/** Leest settings uit localStorage; valt terug op de defaults bij ontbrekende
 * data, corrupte JSON of een ander versieveld, en vult ontbrekende velden aan. */
export function loadSettings(): Settings {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return DEFAULT_SETTINGS;
  try {
    const parsed = JSON.parse(raw) as Omit<Partial<Settings>, "version"> & {
      version?: number;
    };
    if (parsed.version !== VERSION && parsed.version !== MIGRATABLE_VERSION) {
      return DEFAULT_SETTINGS;
    }
    return {
      version: VERSION,
      claude: normalizeAgent(parsed.claude, DEFAULT_SETTINGS.claude),
      codex: normalizeAgent(parsed.codex, DEFAULT_SETTINGS.codex),
      review: { ...DEFAULT_SETTINGS.review, ...parsed.review },
      theme: normalizeTheme(parsed.theme),
      autoRebaseStacks: normalizeAutoRebaseStacks(parsed.autoRebaseStacks),
      notifications: normalizeNotifications(parsed.notifications),
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
