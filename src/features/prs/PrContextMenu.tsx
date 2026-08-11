import { useLayoutEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { ReviewAgent, ReviewMode } from "../agents/crossReview";
import "./contextmenu.css";
import { useRovingMenu } from "./menuNav";
import { keyOfPr } from "./PrList";

interface PrContextMenuProps {
  /** De geselecteerde PR's waarop het menu werkt. */
  prs: PullRequest[];
  position: { x: number; y: number };
  onClose: () => void;
  onOpenOnGitHub: (prs: PullRequest[]) => void;
  onStartReview: (
    prs: PullRequest[],
    mode: ReviewMode,
    agent: ReviewAgent,
  ) => void;
  onSetPriority: (prs: PullRequest[], priority: 1 | 2 | null) => void;
  /** Reden(en) waarom de enkelvoudig geselecteerde PR niet mergebaar is; leeg
   * betekent mergen mag. */
  mergeReasonsFor: (pr: PullRequest) => string[];
  onMergeSingle: (pr: PullRequest) => void;
  runningPrKeys: Set<string>;
  onStopReview: (pr: PullRequest) => void;
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
  onSetPriority,
  mergeReasonsFor,
  onMergeSingle,
  runningPrKeys,
  onStopReview,
}: PrContextMenuProps) {
  const [clamped, setClamped] = useState(position);
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

  const n = prs.length;
  const singlePr = n === 1 ? prs[0] : undefined;
  const mergeReasons = singlePr ? mergeReasonsFor(singlePr) : [];
  const canMerge = singlePr != null && mergeReasons.length === 0;
  const stoppableRun = singlePr != null && runningPrKeys.has(keyOfPr(singlePr));

  const actions: MenuAction[] = [
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
    ...(stoppableRun && singlePr
      ? [
          {
            key: "stop-review",
            label: "Stop review",
            onSelect: () => onStopReview(singlePr),
          },
        ]
      : []),
    {
      key: "prio-1",
      label: "Prioriteit P1",
      onSelect: () => onSetPriority(prs, 1),
    },
    {
      key: "prio-2",
      label: "Prioriteit P2",
      onSelect: () => onSetPriority(prs, 2),
    },
    {
      key: "prio-none",
      label: "Prioriteit weghalen",
      onSelect: () => onSetPriority(prs, null),
    },
  ];
  const sepAfter = new Set([
    "open",
    "merge",
    "review-codex-withFixes",
    "stop-review",
  ]);
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
                onClose();
              }}
            >
              {action.label}
            </button>
            {sepAfter.has(action.key) && <div className="ctx-menu-sep" />}
          </div>
        ))}
      </div>
    </>
  );
}
