import type { MouseEvent } from "react";
import { useEffect, useRef } from "react";
import type { AgentReview, PullRequest } from "../../lib/github/domain";
import type { PrStackInfo } from "../../lib/github/stacks";
import { modKey } from "../../lib/platform";
import { Avatar, avatarBg } from "./Avatar";
import { formatAmsterdam, formatRelative } from "./format";
import { AgentIcon, ConceptIcon, StackIcon } from "./icons";
import "./prlist.css";
import { RowMetrics } from "./RowMetrics";
import { prStatus } from "./rank";
import { StatusGlyph } from "./StatusGlyph";
import type { PrSection } from "./sort";

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
          const showChanges =
            pr.reviewState.state === "changesRequested" && !running;
          const isSelected = key === selectedKey || selectedKeys.has(key);

          return (
            <li key={key} role="presentation">
              {startsSection && (
                <div className="pl-group-header mono" role="presentation">
                  {section.titel}
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
                <span className="pl-gutter">
                  <StatusGlyph status={status} />
                </span>
                <span className="pl-number mono">#{pr.number}</span>
                <div className="pl-main">
                  <div className="pl-title-line">
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
                  </div>
                  <div className="pl-meta">
                    <Avatar author={pr.author} size={15} />
                    <span className="pl-meta-author">{pr.author.login}</span>
                    {showRepoMeta && (
                      <>
                        <span className="pl-meta-sep">·</span>
                        <span className="pl-meta-repo mono">
                          {pr.repoId.split("/")[1]}
                        </span>
                      </>
                    )}
                    <span className="pl-meta-sep">·</span>
                    <span
                      className="pl-meta-time"
                      title={formatAmsterdam(pr.updatedAt)}
                    >
                      {formatRelative(pr.updatedAt)}
                    </span>
                    {running && (
                      <span className="pl-running">
                        <span className="pl-running-dot" />
                        reviewt
                      </span>
                    )}
                    {showChanges && (
                      <span className="pl-changes">changes requested</span>
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
                  </div>
                </div>
                <RowMetrics
                  additions={pr.additions}
                  deletions={pr.deletions}
                  comments={pr.comments}
                />
              </button>
            </li>
          );
        }),
      )}
    </ul>
  );
}
