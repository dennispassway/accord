import type { CSSProperties, MouseEvent } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { AgentReview, PullRequest } from "../../lib/github/domain";
import type { PrStackInfo } from "../../lib/github/stacks";
import { modKey } from "../../lib/platform";
import { Avatar, avatarBg, repoDotBg } from "./Avatar";
import type { AppliedColumns, ColumnKey } from "./columnLayout";
import {
  COLUMN_BOUNDS,
  effectiveColumns,
  maxColumnWidth,
} from "./columnLayout";
import {
  formatAmsterdam,
  formatRelative,
  formatSnoozeUntilCompact,
} from "./format";
import {
  AgentIcon,
  AlertIcon,
  ChevronIcon,
  ClockIcon,
  ConceptIcon,
  EyeIcon,
  MergeIcon,
  ReactieIcon,
  StackIcon,
} from "./icons";
import "./prlist.css";
import { ResizeHandle } from "./ResizeHandle";
import { RowMetrics } from "./RowMetrics";
import type { PrStatusKey } from "./rank";
import { prStatus } from "./rank";
import type { PrSection } from "./sort";
import { useColumnWidths } from "./useColumnWidths";
import { useContainerWidth } from "./useContainerWidth";

/** Icoon per status, zowel in de sectiekop als in de statuskolom. */
const SECTION_ICON: Record<PrStatusKey, typeof EyeIcon> = {
  review: EyeIcon,
  klaar: MergeIcon,
  actie: AlertIcon,
  wachtReview: EyeIcon,
  agent: AgentIcon,
  wachten: ClockIcon,
  concept: ConceptIcon,
};

/** Breedte waarop de lijst wordt gerekend zolang de meting nog niet binnen is. */
const ASSUMED_WIDTH = 720;

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
  /** Toon de projectkolom (de "Alles"-weergave). */
  showRepoMeta: boolean;
  /** Keys of PRs with a review-agent run in progress. */
  runningPrKeys: Set<string>;
  /** Er staat een zoekopdracht in het toolbar-veld: andere lege staat. */
  hasActiveSearch: boolean;
  /** Until-instant (ISO) van een gesnoozede PR; alleen relevant voor rijen in
   * de sectie "later". */
  snoozeUntilOf?: (pr: PullRequest) => string | undefined;
  /** Ingeklapt/uitgeklapt staat van de "Later"-sectie; leeft in Cockpit,
   * want die bepaalt ook welke rijen meetellen voor toetsenbordnavigatie. */
  laterCollapsed: boolean;
  onToggleLater: () => void;
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

/** De tracks als custom properties, zodat kop en rijen dezelfde bron lezen. */
function trackStyle(applied: AppliedColumns): CSSProperties {
  return {
    "--col-project": `${applied.widths.project}px`,
    "--col-nr": `${applied.widths.nr}px`,
    "--col-status": `${applied.widths.status}px`,
    "--col-wie": `${applied.widths.wie}px`,
    "--col-tijd": `${applied.widths.tijd}px`,
    "--col-gap": `${applied.gap}px`,
  } as CSSProperties;
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
  snoozeUntilOf,
  laterCollapsed,
  onToggleLater,
}: PrListProps) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const [tableRef, tableWidth] = useContainerWidth<HTMLDivElement>();
  const {
    columns,
    resize: resizeColumn,
    commit: commitColumn,
    reset: resetColumn,
  } = useColumnWidths();

  // B6: pijltjesnavigatie hield de selectie niet in beeld; scroll de
  // geselecteerde rij minimaal in het zicht bij elke selectiewijziging.
  useEffect(() => {
    if (selectedKey == null) return;
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  const applied = useMemo(
    () =>
      effectiveColumns(columns, tableWidth || ASSUMED_WIDTH, {
        project: showRepoMeta,
      }),
    [columns, tableWidth, showRepoMeta],
  );

  /** Sleepgreep op de rand van een kopcel. */
  function grip(column: ColumnKey, label: string, direction: 1 | -1 = 1) {
    // De greep stopt waar de titel zijn ondergrens raakt. Zonder die grens
    // haalt effectiveColumns de ruimte terug door in te klappen, en dan
    // wordt een kolom smaller terwijl je hem breder sleept.
    const max = maxColumnWidth(column, columns, tableWidth || ASSUMED_WIDTH, {
      project: showRepoMeta,
    });
    const limit = (next: number) => Math.min(next, max);

    return (
      <ResizeHandle
        variant="column"
        label={label}
        direction={direction}
        width={columns[column]}
        min={COLUMN_BOUNDS[column].min}
        max={max}
        onResize={(next) => resizeColumn(column, limit(next))}
        onCommit={(next) => commitColumn(column, limit(next))}
        onReset={() => resetColumn(column)}
      />
    );
  }

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

  /** Eén PR-rij; ook gebruikt voor de rijen in de inklapbare "Later"-sectie. */
  function renderRow(
    pr: PullRequest,
    section: PrSection,
    startsSection: boolean,
  ) {
    const key = keyOfPr(pr);
    const stackInfo = stackInfoByKey.get(key);
    const running = runningPrKeys.has(key);
    const status = prStatus(pr, {
      agentBezig: running,
      stackBlocked: (stackInfo?.blockedByPrNumbers.length ?? 0) > 0,
    });
    const isSelected = key === selectedKey || selectedKeys.has(key);
    const SectionIcon =
      section.statusKey != null ? SECTION_ICON[section.statusKey] : null;
    // Een probleem (conflict, rode checks) krijgt de alarmtoon, ook
    // in "Jouw review nodig" waar de sectie zelf niet rood is.
    const StatusIcon =
      status.problem != null ? AlertIcon : SECTION_ICON[status.key];
    const snoozeUntil =
      section.key === "later" ? snoozeUntilOf?.(pr) : undefined;

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
            onSelect(key, {
              meta: modKey(event),
              shift: event.shiftKey,
            })
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
          {showRepoMeta && (
            <span className="pl-cell pl-cell-project mono" title={pr.repoId}>
              <span
                className="pl-repo-dot"
                style={{ background: repoDotBg(pr.repoId) }}
              />
              {applied.projectLabel && (
                <span className="pl-repo-naam">{pr.repoId.split("/")[1]}</span>
              )}
            </span>
          )}
          <span className="pl-cell pl-cell-nr mono">#{pr.number}</span>
          <span className="pl-cell pl-cell-title">
            <span className="pl-title">{pr.title}</span>
            {stackInfo && stackInfo.stackSize > 1 && (
              <span className="pl-stack-chip mono" title="Positie in de stack">
                <StackIcon />
                {stackInfo.stackPosition}/{stackInfo.stackSize}
              </span>
            )}
          </span>
          <span className="pl-cell pl-cell-status">
            <span
              className={
                status.problem != null
                  ? `pl-status-pill pl-status-pill-${status.key} pl-status-pill-problem`
                  : `pl-status-pill pl-status-pill-${status.key}`
              }
              title={status.label}
            >
              {status.key === "agent" ? (
                <span className="pl-running-dot" />
              ) : (
                !applied.statusLabel && <StatusIcon size={12} />
              )}
              {applied.statusLabel && (
                <span className="pl-status-pill-label">{status.short}</span>
              )}
            </span>
          </span>
          <span className="pl-cell pl-cell-wie">
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
            <Avatar author={pr.author} size={18} />
          </span>
          {applied.showMetrics && (
            <span className="pl-cell pl-cell-omvang">
              <RowMetrics additions={pr.additions} deletions={pr.deletions} />
            </span>
          )}
          {applied.showComments && (
            <span
              className="pl-cell pl-cell-reacties"
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
          )}
          {snoozeUntil != null ? (
            <span
              className="pl-cell pl-cell-tijd"
              title={`Terug op ${formatAmsterdam(snoozeUntil)}`}
            >
              {formatSnoozeUntilCompact(snoozeUntil)}
            </span>
          ) : (
            <span
              className="pl-cell pl-cell-tijd"
              title={formatAmsterdam(pr.updatedAt)}
            >
              {formatRelative(pr.updatedAt)}
            </span>
          )}
        </button>
      </li>
    );
  }

  return (
    <div className="pl-table" ref={tableRef} style={trackStyle(applied)}>
      <div className="pl-thead mono" role="presentation">
        {showRepoMeta && (
          <span className="pl-cell pl-cell-project">
            <span className="pl-thead-label">
              {applied.projectLabel && "Project"}
            </span>
            {applied.projectLabel &&
              grip("project", "Breedte van de kolom Project")}
          </span>
        )}
        <span className="pl-cell pl-cell-nr">
          <span className="pl-thead-label">PR</span>
          {grip("nr", "Breedte van de kolom PR")}
        </span>
        <span className="pl-cell pl-cell-title">
          <span className="pl-thead-label">Titel</span>
        </span>
        <span className="pl-cell pl-cell-status">
          <span className="pl-thead-label">
            {applied.statusLabel && "Status"}
          </span>
          {applied.statusLabel && grip("status", "Breedte van de kolom Status")}
        </span>
        <span className="pl-cell pl-cell-wie">
          <span className="pl-thead-label">Wie</span>
          {grip("wie", "Breedte van de kolom Wie")}
        </span>
        {applied.showMetrics && (
          <span className="pl-cell pl-cell-omvang">
            <span className="pl-thead-label">Omv.</span>
          </span>
        )}
        {applied.showComments && <span className="pl-cell pl-cell-reacties" />}
        <span className="pl-cell pl-cell-tijd">
          {/* Laatste kolom: de greep ligt aan de linkerkant, want rechts van
              deze cel zit geen gap meer. */}
          {grip("tijd", "Breedte van de kolom Tijd", -1)}
          <span className="pl-thead-label">Tijd</span>
        </span>
      </div>

      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: role="listbox" met li[role="presentation"] en per-rij button[role="option"] is de valide ARIA-listbox-pattern */}
      <ul className="pl-list" role="listbox" aria-multiselectable="true">
        {sections.map((section) => {
          if (section.key === "later") {
            return (
              <li key="later" role="presentation">
                <button
                  type="button"
                  className="pl-group-header pl-group-header-later pl-group-header-toggle mono"
                  aria-expanded={!laterCollapsed}
                  onClick={onToggleLater}
                >
                  <span className="pl-group-icon">
                    <ChevronIcon
                      className={
                        laterCollapsed
                          ? "pl-later-chevron"
                          : "pl-later-chevron pl-later-chevron-open"
                      }
                    />
                  </span>
                  <span className="pl-group-title">{section.titel}</span>
                  <span className="pl-group-count">{section.prs.length}</span>
                </button>
                {!laterCollapsed &&
                  section.prs.map((pr) => renderRow(pr, section, false))}
              </li>
            );
          }
          return section.prs.map((pr, index) =>
            renderRow(pr, section, index === 0),
          );
        })}
      </ul>
    </div>
  );
}
