import type { CSSProperties, MouseEvent } from "react";
import { useEffect, useMemo, useRef } from "react";
import type { AgentReview, PullRequest } from "../../lib/github/domain";
import type { PrStackInfo } from "../../lib/github/stacks";
import { modKey } from "../../lib/platform";
import { Avatar, avatarBg, repoDotBg } from "./Avatar";
import type { AppliedColumns, ColumnWidths } from "./columnLayout";
import { DEFAULT_COLUMNS, effectiveColumns } from "./columnLayout";
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
import { useContainerWidth } from "./useContainerWidth";

/** Icoon per status, zowel in de sectiekop als in de statuskolom. */
const SECTION_ICON: Record<PrStatusKey, typeof EyeIcon> = {
  review: EyeIcon,
  klaar: MergeIcon,
  actie: AlertIcon,
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
  /** Versleepte kolombreedtes; ontbreekt hij, dan gelden de defaults. */
  columns?: ColumnWidths;
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
  columns = DEFAULT_COLUMNS,
}: PrListProps) {
  const selectedRowRef = useRef<HTMLButtonElement>(null);
  const [tableRef, tableWidth] = useContainerWidth<HTMLDivElement>();

  // B6: pijltjesnavigatie hield de selectie niet in beeld; scroll de
  // geselecteerde rij minimaal in het zicht bij elke selectiewijziging.
  useEffect(() => {
    if (selectedKey == null) return;
    selectedRowRef.current?.scrollIntoView({ block: "nearest" });
  }, [selectedKey]);

  // De prioriteitkolom kost ruimte in elke rij, dus hij verschijnt alleen als
  // er in beeld ook echt een PR met prioriteit staat.
  const showPrio = useMemo(
    () =>
      sections.some((section) =>
        section.prs.some((pr) => pr.priority === 1 || pr.priority === 2),
      ),
    [sections],
  );

  const applied = useMemo(
    () =>
      effectiveColumns(columns, tableWidth || ASSUMED_WIDTH, {
        project: showRepoMeta,
        prio: showPrio,
      }),
    [columns, tableWidth, showRepoMeta, showPrio],
  );

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
    <div className="pl-table" ref={tableRef} style={trackStyle(applied)}>
      <div className="pl-thead mono" role="presentation">
        {showRepoMeta && (
          <span className="pl-cell pl-cell-project">
            {applied.projectLabel && "Project"}
          </span>
        )}
        <span className="pl-cell pl-cell-nr">PR</span>
        {showPrio && <span className="pl-cell pl-cell-prio" />}
        <span className="pl-cell pl-cell-title">Titel</span>
        <span className="pl-cell pl-cell-status">
          {applied.statusLabel && "Status"}
        </span>
        <span className="pl-cell pl-cell-wie">Wie</span>
        {applied.showMetrics && (
          <span className="pl-cell pl-cell-omvang">Omv.</span>
        )}
        {applied.showComments && <span className="pl-cell pl-cell-reacties" />}
        <span className="pl-cell pl-cell-tijd">Tijd</span>
      </div>

      {/* biome-ignore lint/a11y/noNoninteractiveElementToInteractiveRole: role="listbox" met li[role="presentation"] en per-rij button[role="option"] is de valide ARIA-listbox-pattern */}
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
            const isSelected = key === selectedKey || selectedKeys.has(key);
            const SectionIcon =
              section.statusKey != null
                ? SECTION_ICON[section.statusKey]
                : null;
            const StatusIcon = SECTION_ICON[status.key];

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
                    <span
                      className="pl-cell pl-cell-project mono"
                      title={pr.repoId}
                    >
                      <span
                        className="pl-repo-dot"
                        style={{ background: repoDotBg(pr.repoId) }}
                      />
                      {applied.projectLabel && (
                        <span className="pl-repo-naam">
                          {pr.repoId.split("/")[1]}
                        </span>
                      )}
                    </span>
                  )}
                  <span className="pl-cell pl-cell-nr mono">#{pr.number}</span>
                  {showPrio && (
                    <span className="pl-cell pl-cell-prio">
                      {pr.priority === 1 && (
                        <span className="priority-chip priority-p1">P1</span>
                      )}
                      {pr.priority === 2 && (
                        <span className="priority-chip priority-p2">P2</span>
                      )}
                    </span>
                  )}
                  <span className="pl-cell pl-cell-title">
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
                  </span>
                  <span className="pl-cell pl-cell-status">
                    <span
                      className={`pl-status-pill pl-status-pill-${status.key}`}
                      title={status.label}
                    >
                      {status.key === "agent" ? (
                        <span className="pl-running-dot" />
                      ) : (
                        !applied.statusLabel && <StatusIcon size={12} />
                      )}
                      {applied.statusLabel && (
                        <span className="pl-status-pill-label">
                          {status.short}
                        </span>
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
                      <RowMetrics
                        additions={pr.additions}
                        deletions={pr.deletions}
                      />
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
                  <span
                    className="pl-cell pl-cell-tijd"
                    title={formatAmsterdam(pr.updatedAt)}
                  >
                    {formatRelative(pr.updatedAt)}
                  </span>
                </button>
              </li>
            );
          }),
        )}
      </ul>
    </div>
  );
}
