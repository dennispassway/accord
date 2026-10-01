import { describe, expect, it } from "vitest";
import type { ReviewAgent } from "../agents/crossReview";
import { planAgentAction } from "./agentAction";

const none = () => null;
const only =
  (available: ReviewAgent) =>
  (agent: ReviewAgent): string | null =>
    agent === available ? null : `${agent} ontbreekt`;

describe("planAgentAction", () => {
  it("zet de voorkeursagent op de knop en de andere in het menu", () => {
    const plan = planAgentAction({
      preferred: "claude",
      mode: "fixChecks",
      extraModes: [],
      disabledReason: none,
    });
    expect(plan.primary).toEqual({ agent: "claude", mode: "fixChecks" });
    expect(plan.items).toEqual([
      { agent: "codex", mode: "fixChecks", disabledReason: null },
    ]);
    expect(plan.unavailableReason).toBeNull();
  });

  it("valt terug op de andere agent als de voorkeur niet kan", () => {
    const plan = planAgentAction({
      preferred: "claude",
      mode: "fixChecks",
      extraModes: [],
      disabledReason: only("codex"),
    });
    expect(plan.primary).toEqual({ agent: "codex", mode: "fixChecks" });
    expect(plan.items).toEqual([
      {
        agent: "claude",
        mode: "fixChecks",
        disabledReason: "claude ontbreekt",
      },
    ]);
  });

  it("geeft geen knop en de reden van de voorkeur als niemand kan", () => {
    const plan = planAgentAction({
      preferred: "codex",
      mode: "fixChecks",
      extraModes: ["fixComments"],
      disabledReason: (agent) => `${agent} ontbreekt`,
    });
    expect(plan.primary).toBeNull();
    expect(plan.items).toEqual([]);
    expect(plan.unavailableReason).toBe("codex ontbreekt");
  });

  it("ordent het menu: andere agent voor de modus, dan per extra modus knop-agent en andere", () => {
    const plan = planAgentAction({
      preferred: "claude",
      mode: "withFixes",
      extraModes: ["commentsOnly", "fixComments"],
      disabledReason: none,
    });
    expect(plan.items.map((i) => `${i.mode}:${i.agent}`)).toEqual([
      "withFixes:codex",
      "commentsOnly:claude",
      "commentsOnly:codex",
      "fixComments:claude",
      "fixComments:codex",
    ]);
  });

  it("houdt een niet-beschikbaar menu-item met zijn reden", () => {
    const plan = planAgentAction({
      preferred: "claude",
      mode: "withFixes",
      extraModes: ["commentsOnly"],
      disabledReason: only("claude"),
    });
    expect(plan.items).toContainEqual({
      agent: "codex",
      mode: "commentsOnly",
      disabledReason: "codex ontbreekt",
    });
  });
});
