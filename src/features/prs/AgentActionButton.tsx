import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import { planAgentAction } from "./agentAction";
import { AGENT_LABEL, MODE_LABEL, MODE_TITLE } from "./agentModes";
import "./detail.css";
import { ChevronIcon } from "./icons";
import { useRovingMenu } from "./menuNav";

interface AgentActionButtonProps {
  pr: PullRequest;
  /** Knoptekst, bv. "Fix met Claude"; krijgt de agent van plan.primary mee. */
  label: (agent: ReviewAgent) => string;
  preferred: ReviewAgent;
  mode: AgentMode;
  extraModes?: AgentMode[];
  disabledReason: (agent: ReviewAgent) => string | null;
  /** "model · effort" voor een agent in een modus; tweede regel in het menu. */
  modelLine: (agent: ReviewAgent, mode: AgentMode) => string;
  /** Toetsletter op de knop, bv. "R"; alleen weergave, de sneltoets zit in Cockpit. */
  kbd?: string;
  onStartRun: (pr: PullRequest, agent: ReviewAgent, mode: AgentMode) => void;
}

/**
 * Eén knop per handeling met de voorkeursagent erop; de andere agent (en
 * eventuele extra modi) zitten achter een chevron-menu. Rendert niets als
 * geen enkele agent kan: de aanroeper toont de reden dan één keer.
 */
export function AgentActionButton({
  pr,
  label,
  preferred,
  mode,
  extraModes = [],
  disabledReason,
  modelLine,
  kbd,
  onStartRun,
}: AgentActionButtonProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const plan = planAgentAction({ preferred, mode, extraModes, disabledReason });
  const { setItemRef, handleKeyDown, tabIndexFor } = useRovingMenu(
    plan.items.length,
    0,
    menuOpen,
    plan.items.map((item) => item.disabledReason != null),
  );
  const menuUsable = plan.items.some((item) => item.disabledReason == null);

  if (plan.primary == null) return null;
  const { agent, mode: primaryMode } = plan.primary;

  function closeMenu() {
    setMenuOpen(false);
    chevronRef.current?.focus();
  }

  function handleMenuAreaKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    handleKeyDown(event);
  }

  return (
    <div className="agent-action">
      <button
        type="button"
        className="agent-action-main"
        title={
          `${MODE_LABEL[primaryMode]} · ${modelLine(agent, primaryMode)}` +
          (MODE_TITLE[primaryMode] ? `. ${MODE_TITLE[primaryMode]}` : "")
        }
        onClick={() => onStartRun(pr, agent, primaryMode)}
      >
        {label(agent)}
        {kbd != null && agent === preferred && (
          <span className="agent-action-kbd mono">{kbd}</span>
        )}
      </button>
      {menuUsable && (
        <div className="agent-action-menu-wrap">
          <button
            type="button"
            ref={chevronRef}
            className="agent-action-chevron"
            title="Andere agent of modus"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ChevronIcon className="agent-action-chevron-icon" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="detail-merge-menu-overlay"
                aria-label="Sluit menu"
                onClick={closeMenu}
              />
              <div
                className="detail-agent-menu agent-action-menu"
                role="menu"
                onKeyDown={handleMenuAreaKeyDown}
              >
                {plan.items.map((item, index) => (
                  <button
                    key={`${item.mode}:${item.agent}`}
                    type="button"
                    role="menuitem"
                    ref={setItemRef(index)}
                    tabIndex={tabIndexFor(index)}
                    className="agent-action-item"
                    disabled={item.disabledReason != null}
                    title={item.disabledReason ?? MODE_TITLE[item.mode]}
                    onClick={() => {
                      closeMenu();
                      onStartRun(pr, item.agent, item.mode);
                    }}
                  >
                    <span>{`${MODE_LABEL[item.mode]} · ${AGENT_LABEL[item.agent]}`}</span>
                    <span className="agent-action-model mono">
                      {item.disabledReason ?? modelLine(item.agent, item.mode)}
                    </span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
