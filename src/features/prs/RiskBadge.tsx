import type { RiskGate } from "../../lib/risk";
import "./prlist.css";

export function RiskBadge({ gate }: { gate: RiskGate }) {
  if (gate.tier !== "hoog") return null;
  return (
    <span
      className="verdict-badge verdict-badge-risico mono"
      title={gate.reasons.join("\n")}
    >
      hoog risico
    </span>
  );
}
