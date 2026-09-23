import { useLayoutEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { AgentMode, ReviewAgent, ReviewMode } from "../agents/crossReview";
import { availableFixModes } from "../agents/crossReview";
import { MODE_LABEL, MODE_TITLE } from "./AgentButtons";
import "./contextmenu.css";
import { useRovingMenu } from "./menuNav";
import { keyOfPr } from "./PrList";
import {
  fromAmsterdamLocal,
  isPastOrNow,
  nextMondayAt9,
  toAmsterdamLocal,
  tomorrowAt9,
} from "./snooze";

interface PrContextMenuProps {
  /** De geselecteerde PR's waarop het menu werkt. */
  prs: PullRequest[];
  position: { x: number; y: number };
  onClose: () => void;
  onOpenOnGitHub: (prs: PullRequest[]) => void;
  onStartReview: (
    prs: PullRequest[],
    mode: AgentMode,
    agent: ReviewAgent,
  ) => void;
  /** Reden(en) waarom de enkelvoudig geselecteerde PR niet mergebaar is; leeg
   * betekent mergen mag. */
  mergeReasonsFor: (pr: PullRequest) => string[];
  onMergeSingle: (pr: PullRequest) => void;
  runningPrKeys: Set<string>;
  onStopReview: (pr: PullRequest) => void;
  /** Snoozet de gegeven PR's tot het opgegeven moment. */
  onSnooze: (prs: PullRequest[], until: Date) => void;
  /** Heft de snooze van de gegeven PR's op. */
  onUnsnooze: (prs: PullRequest[]) => void;
  isSnoozed: (pr: PullRequest) => boolean;
}

/** "Open op GitHub" bij 1 PR, "Open op GitHub (3)" bij N>1. */
function withCount(label: string, n: number): string {
  return n > 1 ? `${label} (${n})` : label;
}

/** Beide agents expliciet kiesbaar; de kruisreview-standaard blijft op R. */
const REVIEW_CHOICES: {
  agent: ReviewAgent;
  mode: ReviewMode;
  label: string;
}[] = [
  { agent: "claude", mode: "commentsOnly", label: "Claude: comments" },
  {
    agent: "claude",
    mode: "withFixes",
    label: "Claude: comments + fixes",
  },
  { agent: "codex", mode: "commentsOnly", label: "Codex: comments" },
  { agent: "codex", mode: "withFixes", label: "Codex: comments + fixes" },
];

interface MenuAction {
  key: string;
  label: string;
  disabled?: boolean;
  title?: string;
  onSelect: () => void;
}

/**
 * Eigen HTML-contextmenu (geen Tauri native menu), stijl consistent met
 * .detail-agent-menu. Werkt zowel op één PR als op de hele selectie.
 * Roving-focus toetsenbordnavigatie (pijltjes/Enter/Escape) via useRovingMenu,
 * hetzelfde patroon als SortMenu, MergeSection en AgentButtons.
 */
export function PrContextMenu({
  prs,
  position,
  onClose,
  onOpenOnGitHub,
  onStartReview,
  mergeReasonsFor,
  onMergeSingle,
  runningPrKeys,
  onStopReview,
  onSnooze,
  onUnsnooze,
  isSnoozed,
}: PrContextMenuProps) {
  const [clamped, setClamped] = useState(position);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState("");
  const menuRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    function measure(menu: HTMLElement) {
      const rect = menu.getBoundingClientRect();
      const x = Math.min(position.x, window.innerWidth - rect.width - 8);
      const y = Math.min(position.y, window.innerHeight - rect.height - 8);
      setClamped({ x: Math.max(x, 8), y: Math.max(y, 8) });
    }
    if (menuRef.current) measure(menuRef.current);
  }, [position]);

  useLayoutEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    const list = document.querySelector(".pl-list");
    window.addEventListener("keydown", handleKeyDown);
    list?.addEventListener("scroll", onClose);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      list?.removeEventListener("scroll", onClose);
    };
  }, [onClose]);

  // Eén "nu" voor deze render, zowel voor de `min` op de picker als voor de
  // "in het verleden"-check op de gekozen waarde; een snooze in het verleden
  // zou meteen weer wakker zijn.
  const now = new Date();
  const n = prs.length;
  const singlePr = n === 1 ? prs[0] : undefined;
  const mergeReasons = singlePr ? mergeReasonsFor(singlePr) : [];
  const canMerge = singlePr != null && mergeReasons.length === 0;
  const stoppableRun = singlePr != null && runningPrKeys.has(keyOfPr(singlePr));

  // Zelfde fix-modes als het chevron-menu in het detailpaneel, zodat beide
  // menu's dezelfde acties bieden; alleen bij één PR, want de modes hangen af
  // van de toestand van die ene PR.
  const agentLabel: Record<ReviewAgent, string> = {
    claude: "Claude",
    codex: "Codex",
  };
  const fixChoices = singlePr
    ? (["claude", "codex"] as const).flatMap((agent) =>
        availableFixModes(singlePr).map((mode) => ({ agent, mode })),
      )
    : [];

  const baseActions: MenuAction[] = [
    {
      key: "open",
      label: n > 1 ? `Open ${n} op GitHub` : "Open op GitHub",
      onSelect: () => onOpenOnGitHub(prs),
    },
    ...(singlePr
      ? [
          {
            key: "merge",
            label: "Merge",
            disabled: !canMerge,
            title: canMerge ? undefined : mergeReasons.join(" · "),
            onSelect: () => onMergeSingle(singlePr),
          },
        ]
      : []),
    ...REVIEW_CHOICES.map(({ agent, mode, label }) => ({
      key: `review-${agent}-${mode}`,
      label: withCount(label, n),
      onSelect: () => onStartReview(prs, mode, agent),
    })),
    ...fixChoices.map(({ agent, mode }) => ({
      key: `fix-${agent}-${mode}`,
      label: `${agentLabel[agent]}: ${MODE_LABEL[mode].charAt(0).toLowerCase()}${MODE_LABEL[mode].slice(1)}`,
      title: MODE_TITLE[mode],
      onSelect: () => onStartReview(prs, mode, agent),
    })),
    ...(stoppableRun && singlePr
      ? [
          {
            key: "stop-review",
            label: "Stop review",
            onSelect: () => onStopReview(singlePr),
          },
        ]
      : []),
  ];
  const canUnsnooze = n > 0 && prs.every(isSnoozed);
  const snoozeActions: MenuAction[] = [
    {
      key: "snooze-tomorrow",
      label: "Later: morgen 09:00",
      onSelect: () => onSnooze(prs, tomorrowAt9(new Date())),
    },
    {
      key: "snooze-monday",
      label: "Later: maandag 09:00",
      onSelect: () => onSnooze(prs, nextMondayAt9(new Date())),
    },
    {
      key: "snooze-custom",
      label: "Later: kies moment…",
      onSelect: () => setPickerOpen(true),
    },
    ...(canUnsnooze
      ? [
          {
            key: "unsnooze",
            label: "Snooze opheffen",
            onSelect: () => onUnsnooze(prs),
          },
        ]
      : []),
  ];
  const actions: MenuAction[] = [...baseActions, ...snoozeActions];

  const sepAfter = new Set([
    "open",
    "merge",
    "review-codex-withFixes",
    "stop-review",
  ]);
  const lastFix = fixChoices[fixChoices.length - 1];
  if (lastFix) sepAfter.add(`fix-${lastFix.agent}-${lastFix.mode}`);
  // Altijd een scheidingslijn tussen het bestaande menu en de snooze-groep.
  const lastBaseAction = baseActions[baseActions.length - 1];
  if (lastBaseAction != null) sepAfter.add(lastBaseAction.key);
  const disabledMask = actions.map((action) => action.disabled === true);

  const { setItemRef, handleKeyDown, tabIndexFor } = useRovingMenu(
    actions.length,
    0,
    true,
    disabledMask,
  );

  return (
    <>
      <button
        type="button"
        className="ctx-menu-overlay"
        onClick={onClose}
        aria-label="Sluit menu"
      />
      {pickerOpen ? (
        <div
          className="ctx-menu ctx-snooze-picker"
          style={{ left: clamped.x, top: clamped.y }}
        >
          <label
            className="ctx-snooze-picker-label"
            htmlFor="ctx-snooze-datetime"
          >
            Snoozen tot
          </label>
          <input
            id="ctx-snooze-datetime"
            type="datetime-local"
            className="ctx-snooze-picker-input"
            min={toAmsterdamLocal(now)}
            // biome-ignore lint/a11y/noAutofocus: het menu-item met de focus is net ontkoppeld; zonder dit valt de focus naar body en is de picker per toetsenbord onbereikbaar
            autoFocus
            value={pickerValue}
            onChange={(event) => setPickerValue(event.target.value)}
          />
          <div className="ctx-snooze-picker-actions">
            <button type="button" className="ctx-menu-item" onClick={onClose}>
              Annuleren
            </button>
            <button
              type="button"
              className="ctx-menu-item"
              disabled={isPastOrNow(pickerValue, now)}
              onClick={() => {
                // `now` is van de laatste render: een gekozen moment kan
                // sindsdien verstreken zijn.
                if (isPastOrNow(pickerValue, new Date())) return;
                onSnooze(prs, fromAmsterdamLocal(pickerValue));
                onClose();
              }}
            >
              Snoozen
            </button>
          </div>
        </div>
      ) : (
        <div
          ref={menuRef}
          className="ctx-menu"
          role="menu"
          style={{ left: clamped.x, top: clamped.y }}
          onKeyDown={handleKeyDown}
        >
          {actions.map((action, index) => (
            <div key={action.key} role="none">
              <button
                type="button"
                role="menuitem"
                ref={setItemRef(index)}
                tabIndex={tabIndexFor(index)}
                className="ctx-menu-item"
                disabled={action.disabled}
                title={action.title}
                onClick={() => {
                  action.onSelect();
                  if (action.key !== "snooze-custom") onClose();
                }}
              >
                {action.label}
              </button>
              {/* Nooit achter het laatste item: dat geeft een hangende lijn
                  onderaan het menu, want welke groep als laatste overblijft
                  hangt af van de PR (merge, fixes, stop review). */}
              {sepAfter.has(action.key) && index < actions.length - 1 && (
                <div className="ctx-menu-sep" />
              )}
            </div>
          ))}
        </div>
      )}
    </>
  );
}
