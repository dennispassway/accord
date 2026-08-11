import { AlertIcon, CheckIcon } from "./icons";
import type { PrStatus } from "./rank";

const COLOR: Record<PrStatus["key"], string> = {
  klaar: "var(--ok)",
  review: "var(--accent)",
  actie: "var(--err)",
  agent: "var(--agent)",
  wachten: "var(--text-3)",
  concept: "var(--text-3)",
};

/**
 * Eén glyph in de gutter van 14px: vinkje (klaar), stip (review nodig),
 * driehoek (actie nodig), pulserende stip (agent bezig), ring (wachten of
 * concept). De rank in `status` is ook de sorteersleutel elders.
 */
export function StatusGlyph({ status }: { status: PrStatus }) {
  const color = COLOR[status.key];
  return (
    <span className="status-glyph" title={status.label}>
      {status.key === "klaar" && (
        <span className="status-glyph-icon" style={{ color }}>
          <CheckIcon size={12} />
        </span>
      )}
      {status.key === "actie" && (
        <span className="status-glyph-icon" style={{ color }}>
          <AlertIcon size={12} />
        </span>
      )}
      {status.key === "review" && (
        <span className="status-glyph-dot" style={{ background: color }} />
      )}
      {status.key === "agent" && (
        <span
          className="status-glyph-dot status-glyph-pulse"
          style={{ background: color }}
        />
      )}
      {(status.key === "wachten" || status.key === "concept") && (
        <span
          className="status-glyph-ring"
          style={{ boxShadow: `inset 0 0 0 1.5px ${color}` }}
        />
      )}
    </span>
  );
}
