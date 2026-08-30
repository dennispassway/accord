import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import type { AgentReview, PullRequest } from "../../lib/github/domain";
import type { PrStackInfo } from "../../lib/github/stacks";
import { modKey } from "../../lib/platform";
import { Avatar, avatarBg } from "./Avatar";
import { formatAmsterdam, formatRelative } from "./format";
import {
  AgentIcon,
  AlertIcon,
  ClockIcon,
  ConceptIcon,
  EyeIcon,
  MergeIcon,
  ReactieIcon,
  StackIcon,
} from "./icons";
import "./prlist.css";
import { RowMetrics } from "./RowMetrics";
import type { PrStatusKey } from "./rank";
import { prStatus } from "./rank";
import type { PrSection } from "./sort";

/** Statuskeys die als pill in de rij verschijnen; "wachten"/"concept" niet. */
const PILL_STATUS_KEYS = new Set(["actie", "agent", "klaar", "review"]);

/** Icoon per sectiestatus in de gettinte sectiekop. */
const SECTION_ICON: Record<PrStatusKey, typeof EyeIcon> = {
  review: EyeIcon,
  klaar: MergeIcon,
  actie: AlertIcon,
  agent: AgentIcon,
  wachten: ClockIcon,
  concept: ConceptIcon,
};

interface PrListProps {
  /** Secties uit sort.ts; een lege titel betekent geen kop tonen. */
  sections: PrSection[];
  stackInfoByKey: Map<string, PrStackInfo>;
  selectedKey: string | null;
  /** Alle geselecteerde keys (multi-select); bevat altijd minstens selectedKey. */
  selectedKeys: Set<string>;
  onSelect: (key: string, mods: { meta: boolean; shift: boolean }) => void;
  onRowDoubleClick: (key: string) => void;
  onContextMenu: (key: string, event: MouseEvent) => void;
  /** Toon de repo-naam in de metaregel (de "Alles"-weergave). */
  showRepoMeta: boolean;
  /** Keys of PRs with a review-agent run in progress. */
  runningPrKeys: Set<string>;
  /** Er staat een zoekopdracht in het toolbar-veld: andere lege staat. */
  hasActiveSearch: boolean;
}

export function keyOfPr(pr: PullRequest): string {
  return `${pr.repoId}#${pr.number}`;
}

const AGENT_NAME: Record<AgentReview["agent"], string> = {
  claude: "Claude",
  codex: "Codex",
};

/** "Claude · 4 opmerkingen, 2 commits" voor de tooltip op de rij-badge. */
function agentBadgeTitle(review: AgentReview): string {
  const parts = [
    `${review.commentCount} ${review.commentCount === 1 ? "opmerking" : "opmerkingen"}`,
  ];
  if (review.commitCount > 0) {
    parts.push(
      `${review.commitCount} ${review.commitCount === 1 ? "commit" : "commits"}`,
    );
  }
  return `${AGENT_NAME[review.agent]} · ${parts.join(", ")}`;
}

export function PrList({
  sections,
  stackInfoByKey,
  selectedKey,
  selectedKeys,
  onSelect,
  onRowDoubleClick,
  onContextMenu,
  showRepoMeta,
  runningPrKeys,
  hasActiveSearch,
}: PrListProps) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  // B6: pijltjesnavigatie hield de selectie niet in beeld; scroll de
  // geselecteerde rij minimaal in het zicht bij elke selectiewijziging.
  useEffect(() => {
    if (selectedKey == null) return;
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  const isEmpty = sections.every((section) => section.prs.length === 0);
  if (isEmpty) {
    return (
      <div className="empty-state">
        {hasActiveSearch
          ? "Geen PR's voor deze zoekopdracht"
          : "Niets te reviewen"}
      </div>
    );
  }

  return (
    // biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: role="listbox" met li[role="presentation"] en per-rij button[role="option"] is de valide ARIA-listbox-pattern
    <ul className="pl-list" role="listbox" aria-multiselectable="true">
      {sections.map((section) =>
        section.prs.map((pr, index) => {
          const key = keyOfPr(pr);
          const stackInfo = stackInfoByKey.get(key);
          const startsSection = index === 0 && section.titel !== "";
          const running = runningPrKeys.has(key);
          const status = prStatus(pr, {
            agentBezig: running,
            stackBlocked: (stackInfo?.blockedByPrNumbers.length ?? 0) > 0,
          });
          const showPill = PILL_STATUS_KEYS.has(status.key);
          const isSelected = key === selectedKey || selectedKeys.has(key);
          const SectionIcon =
            section.statusKey != null ? SECTION_ICON[section.statusKey] : null;

          return (
            <li key={key} role="presentation">
              {startsSection && (
                <div
                  className={
                    section.statusKey != null
                      ? `pl-group-header mono pl-group-header-${section.statusKey}`
                      : "pl-group-header mono"
                  }
                  role="presentation"
                >
                  {SectionIcon != null && (
                    <span className="pl-group-icon">
                      <SectionIcon size={14} />
                    </span>
                  )}
                  <span className="pl-group-title">{section.titel}</span>
                  <span className="pl-group-count">{section.prs.length}</span>
                </div>
              )}
              <button
                type="button"
                ref={key === selectedKey ? selectedRowRef : undefined}
                role="option"
                aria-selected={isSelected}
                className={
                  key === selectedKey
                    ? "pl-row pl-row-selected"
                    : selectedKeys.has(key)
                      ? "pl-row pl-row-multi"
                      : "pl-row"
                }
                onClick={(event) =>
                  onSelect(key, { meta: modKey(event), shift: event.shiftKey })
                }
                onDoubleClick={() => {
                  onSelect(key, { meta: false, shift: false });
                  onRowDoubleClick(key);
                }}
                onContextMenu={(event) => {
                  event.preventDefault();
                  onContextMenu(key, event);
                }}
              >
                <span className="pl-number mono">#{pr.number}</span>
                {pr.priority === 1 && (
                  <span className="priority-chip priority-p1">P1</span>
                )}
                {pr.priority === 2 && (
                  <span className="priority-chip priority-p2">P2</span>
                )}
                {pr.isDraft && (
                  <span className="pl-draft-chip">
                    <ConceptIcon size={9} />
                    concept
                  </span>
                )}
                <span className="pl-title">{pr.title}</span>
                {stackInfo && stackInfo.stackSize > 1 && (
                  <span
                    className="pl-stack-chip mono"
                    title="Positie in de stack"
                  >
                    <StackIcon />
                    {stackInfo.stackPosition}/{stackInfo.stackSize}
                  </span>
                )}
                <span className="pl-row-end">
                  {showPill && (
                    <span
                      className={`pl-status-pill pl-status-pill-${status.key}`}
                    >
                      {status.key === "agent" && (
                        <span className="pl-running-dot" />
                      )}
                      <span className="pl-status-pill-label">
                        {status.label}
                      </span>
                    </span>
                  )}
                  {pr.agentReviews.length > 0 && (
                    <span className="pl-agent-cluster">
                      {pr.agentReviews.map((review) => (
                        <span
                          key={review.agent}
                          className="pl-agent-badge"
                          style={{ background: avatarBg(review.agent) }}
                          title={agentBadgeTitle(review)}
                        >
                          <AgentIcon size={9} />
                          <span
                            className={
                              review.mode === "commentsAndFixes"
                                ? "pl-agent-badge-dot pl-agent-badge-dot-fixes"
                                : "pl-agent-badge-dot"
                            }
                          />
                        </span>
                      ))}
                    </span>
                  )}
                  <Avatar author={pr.author} size={15} />
                  {showRepoMeta && (
                    <span className="pl-repo mono">
                      {pr.repoId.split("/")[1]}
                    </span>
                  )}
                  <RowMetrics
                    additions={pr.additions}
                    deletions={pr.deletions}
                  />
                  <span
                    className="pl-comments"
                    title={
                      pr.comments > 0
                        ? `${pr.comments} ${pr.comments === 1 ? "reactie" : "reacties"} op deze PR`
                        : undefined
                    }
                  >
                    {pr.comments > 0 && (
                      <>
                        <ReactieIcon size={11} />
                        <span className="mono">{pr.comments}</span>
                      </>
                    )}
                  </span>
                  <span
                    className="pl-time"
                    title={formatAmsterdam(pr.updatedAt)}
                  >
                    {formatRelative(pr.updatedAt)}
                  </span>
                </span>
              </button>
            </li>
          );
        }),
      )}
    </ul>
  );
}
