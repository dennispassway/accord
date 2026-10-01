import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import { otherAgent } from "./agentModes";

interface AgentActionChoice {
  agent: ReviewAgent;
  mode: AgentMode;
  disabledReason: string | null;
}

export interface AgentActionPlan {
  /** De knop zelf; null als geen enkele agent deze handeling kan draaien. */
  primary: { agent: ReviewAgent; mode: AgentMode } | null;
  /** Menu-items: eerst de andere agent voor `mode`, daarna per extra modus
   * eerst de knop-agent en dan de andere. De keuze op de knop zit er niet in. */
  items: AgentActionChoice[];
  /** De reden waarom geen agent kan, als primary null is. */
  unavailableReason: string | null;
}

export function planAgentAction(input: {
  preferred: ReviewAgent;
  mode: AgentMode;
  extraModes: AgentMode[];
  disabledReason: (agent: ReviewAgent) => string | null;
}): AgentActionPlan {
  const { preferred, mode, extraModes, disabledReason } = input;
  const preferredReason = disabledReason(preferred);
  const other = otherAgent(preferred);
  const lead =
    preferredReason == null
      ? preferred
      : disabledReason(other) == null
        ? other
        : null;
  if (lead == null) {
    return { primary: null, items: [], unavailableReason: preferredReason };
  }
  const second = otherAgent(lead);
  const choice = (agent: ReviewAgent, m: AgentMode): AgentActionChoice => ({
    agent,
    mode: m,
    disabledReason: disabledReason(agent),
  });
  return {
    primary: { agent: lead, mode },
    items: [
      choice(second, mode),
      ...extraModes.flatMap((m) => [choice(lead, m), choice(second, m)]),
    ],
    unavailableReason: null,
  };
}
