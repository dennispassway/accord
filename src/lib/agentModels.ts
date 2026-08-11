import { invoke } from "@tauri-apps/api/core";

export interface AgentModels {
  claude: string[];
  codex: string[];
}

const NONE: AgentModels = { claude: [], codex: [] };

let cached: Promise<AgentModels> | null = null;

/**
 * Vraagt de lokale CLI's één keer per sessie om hun modellen. Zonder Tauri
 * (mockmodus, kale browser) of bij een fout blijft de lijst leeg en valt de UI
 * terug op de fallback uit settings.ts.
 */
export function loadAgentModels(): Promise<AgentModels> {
  cached ??= (async () => {
    try {
      return await invoke<AgentModels>("agent_models");
    } catch {
      return NONE;
    }
  })();
  return cached;
}
