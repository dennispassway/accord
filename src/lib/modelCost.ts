/** Relatieve kosten t.o.v. Opus (×1), op substring van de modelnaam. */
const CLAUDE_COST_FACTORS: [string, number][] = [
  ["haiku", 0.25],
  ["sonnet", 0.5],
  ["opus", 1],
  ["fable", 2.5],
];

/** Alleen voor Claude-modellen; onbekend (ook alle codex-modellen): undefined. */
export function costFactor(model: string): number | undefined {
  const name = model.toLowerCase();
  return CLAUDE_COST_FACTORS.find(([key]) => name.includes(key))?.[1];
}

export function formatCostFactor(factor: number): string {
  return `×${String(factor).replace(".", ",")}`;
}
