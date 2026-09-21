import type { KeyboardEvent } from "react";
import { useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { AgentMode, ReviewAgent, ReviewMode } from "../agents/crossReview";
import "./detail.css";
import { ChevronIcon } from "./icons";
import { useRovingMenu } from "./menuNav";

export const MODE_LABEL: Record<AgentMode, string> = {
  commentsOnly: "Comments",
  withFixes: "Comments + fixes",
  fixComments: "Fix bevindingen",
  fixChecks: "Fix checks",
  fixConflicts: "Los conflict op",
  distillLearnings: "Lessen vastleggen",
  distillLearningsInline: "Lessen vastleggen (in PR)",
};

/** Uitleg voor modi waarvan het label alleen niet duidelijk maakt wat er
 * gebeurt; getoond als title-tooltip in beide menu's. */
export const MODE_TITLE: Partial<Record<AgentMode, string>> = {
  distillLearnings:
    "Destilleert de lessen uit de review-comments en fixes naar CLAUDE.md of een skill, via een eigen PR",
  distillLearningsInline:
    "Destilleert de lessen uit de review-comments en fixes naar CLAUDE.md of een skill, als commit op de PR-branch zelf",
};

/** De andere reviewmodus, voor het menu naast de primaire reviewknop. */
export function altReviewMode(mode: ReviewMode): ReviewMode {
  return mode === "withFixes" ? "commentsOnly" : "withFixes";
}

interface AgentButtonsProps {
  pr: PullRequest;
  agent: ReviewAgent;
  /** Toont de R-sneltoets: alleen op de voorkeursreviewer. */
  primary: boolean;
  primaryMode: AgentMode;
  /** De overige modi achter het chevron-menu; leeg verbergt het chevron. */
  menuModes: AgentMode[];
  /** "model · effort" uit de instellingen, getoond als mono 9px-regel onder de agentnaam. */
  modelLine?: string;
  disabledReason: string | null;
  onStartRun: (pr: PullRequest, agent: ReviewAgent, mode: AgentMode) => void;
}

/**
 * Eén 26px-knop die de primaire modus start, met de overige modi achter een
 * chevron-menu. De review- en fixkaart in het detailpaneel gebruiken dezelfde
 * rij met een andere modusverdeling. Ontbreekt de CLI (of loopt er al een
 * run), dan vervangt de reden de knop.
 */
export function AgentButtons({
  pr,
  agent,
  primary,
  primaryMode,
  menuModes,
  modelLine,
  disabledReason,
  onStartRun,
}: AgentButtonsProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const disabled = disabledReason != null;
  const chevronRef = useRef<HTMLButtonElement>(null);
  const { setItemRef, handleKeyDown, tabIndexFor } = useRovingMenu(
    menuModes.length,
    0,
    menuOpen,
  );

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
    <div className="detail-agent-row">
      <span className="detail-agent-name">
        <span className="detail-agent-name-label">{agent}</span>
        {modelLine != null && (
          <span className="detail-agent-model mono">{modelLine}</span>
        )}
      </span>
      {disabled ? (
        <span className="detail-agent-disabled" title={disabledReason}>
          {disabledReason}
        </span>
      ) : (
        <>
          <button
            type="button"
            className="detail-agent-primary"
            title={MODE_TITLE[primaryMode]}
            onClick={() => onStartRun(pr, agent, primaryMode)}
          >
            {MODE_LABEL[primaryMode]}
            {primary && <span className="detail-agent-kbd mono">R</span>}
          </button>
          {menuModes.length > 0 && (
            <div className="detail-agent-menu-wrap">
              <button
                type="button"
                ref={chevronRef}
                className="detail-agent-chevron"
                title="Andere modus"
                onClick={() => setMenuOpen((open) => !open)}
              >
                <ChevronIcon className="detail-agent-chevron-icon" />
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
                    className="detail-agent-menu"
                    role="menu"
                    onKeyDown={handleMenuAreaKeyDown}
                  >
                    {menuModes.map((mode, index) => (
                      <button
                        key={mode}
                        type="button"
                        role="menuitem"
                        ref={setItemRef(index)}
                        tabIndex={tabIndexFor(index)}
                        className="detail-agent-menu-item"
                        title={MODE_TITLE[mode]}
                        onClick={() => {
                          closeMenu();
                          onStartRun(pr, agent, mode);
                        }}
                      >
                        {MODE_LABEL[mode]}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
