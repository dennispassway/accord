import { openUrl } from "@tauri-apps/plugin-opener";
import type {
  Author,
  PrNumber,
  PullRequest,
  RepoId,
} from "../../lib/github/domain";
import { deriveAuthor } from "../../lib/github/domain";
import type { MergeMethod } from "../../lib/github/merge";
import type { PrStackInfo } from "../../lib/github/stacks";
import type { Settings } from "../../lib/settings";
import { AgentLogPanel } from "../agents/AgentLogPanel";
import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import { preferredReviewer } from "../agents/crossReview";
import { RepoPathSetup } from "../agents/RepoPathSetup";
import type { AgentClis, AgentRun } from "../agents/useAgentRuns";
import { AgentButtons } from "./AgentButtons";
import { Avatar } from "./Avatar";
import { BulkReviewButton } from "./BulkReviewButton";
import { CiStatus } from "./CiStatus";
import "./detail.css";
import { formatAmsterdam, formatRelative } from "./format";
import {
  ConceptIcon,
  ExternalLinkIcon,
  SettingsIcon,
  StackIcon,
} from "./icons";
import { MergeSection } from "./MergeSection";
import { PrioritySegmented } from "./PrioritySegmented";
import { ReviewHistory } from "./ReviewHistory";
import { sizeWord } from "./RowMetrics";
import type { PrStatusKey } from "./rank";
import { prStatus } from "./rank";
import { StackRail } from "./StackRail";

const STATUS_COLOR: Record<PrStatusKey, string> = {
  klaar: "var(--ok)",
  review: "var(--accent)",
  actie: "var(--err)",
  agent: "var(--agent)",
  wachten: "var(--text-3)",
  concept: "var(--text-3)",
};

const REVIEW_LABEL: Record<PullRequest["reviewState"]["state"], string> = {
  reviewRequested: "review gevraagd",
  approved: "goedgekeurd",
  changesRequested: "changes requested",
  none: "geen review",
};

interface PersonEntry {
  author: Author;
  note: string;
  reviewerState?: PullRequest["reviewers"][number]["state"];
}

const REVIEWER_STATE_LABEL: Record<
  PullRequest["reviewers"][number]["state"],
  string
> = {
  approved: "goedgekeurd",
  changesRequested: "changes requested",
  pending: "in afwachting",
};

/** Eén persoon-rij: avatar (18px), naam, en een statusnotitie. Eigen avatar
 * krijgt een amber ring als `meLogin` meegegeven en overeenkomt. */
function PersonRow({
  entry,
  meLogin,
}: {
  entry: PersonEntry;
  meLogin: string | undefined;
}) {
  const isMe = meLogin != null && entry.author.login === meLogin;
  return (
    <span className="detail-person">
      <span
        className={
          isMe
            ? "detail-person-avatar detail-person-avatar-me"
            : "detail-person-avatar"
        }
      >
        <Avatar author={entry.author} size={18} />
        {entry.reviewerState != null && entry.reviewerState !== "pending" && (
          <span
            className={`detail-person-badge detail-person-badge-${entry.reviewerState}`}
          />
        )}
      </span>
      <span className="detail-person-name">{entry.author.login}</span>
      <span className="detail-person-note mono">{entry.note}</span>
    </span>
  );
}

function PeopleColumn({
  label,
  entries,
  emptyLabel,
  meLogin,
}: {
  label: string;
  entries: PersonEntry[];
  emptyLabel: string;
  meLogin: string | undefined;
}) {
  return (
    <>
      <span className="detail-label detail-people-label">{label}</span>
      <span className="detail-people-column">
        {entries.length === 0 ? (
          <span className="detail-people-empty">{emptyLabel}</span>
        ) : (
          entries.map((entry) => (
            <PersonRow
              key={entry.author.login}
              entry={entry}
              meLogin={meLogin}
            />
          ))
        )}
      </span>
    </>
  );
}

interface DetailPanelProps {
  pr: PullRequest | undefined;
  stackInfo: PrStackInfo | undefined;
  stackChain: PullRequest[];
  onSetPriority: (
    repoId: RepoId,
    prNumber: PrNumber,
    priority: 1 | 2 | null,
  ) => void;
  /** Reden van een mislukte prioriteits-write voor de geselecteerde PR. */
  priorityError?: string | null;
  onMergePr: (pr: PullRequest, method: MergeMethod) => Promise<void>;
  clis: AgentClis;
  repoPath: string | undefined;
  run: AgentRun | undefined;
  onStartRun: (pr: PullRequest, agent: ReviewAgent, mode: AgentMode) => void;
  onCancelRun: (runId: string) => void;
  onRepoLinked: () => Promise<void>;
  settings: Settings;
  /** Alle PR's in beeld, voor de bulkactie "review alles zonder agent-review". */
  allPrs: PullRequest[];
  runningPrKeys: Set<string>;
  onBulkStart: (prs: PullRequest[]) => void;
  /** Login van de ingelogde gebruiker: kleurt "jij" bij mensen-rijen en zet
   * de amber ring op je eigen avatar. */
  meLogin?: string;
  /** Klikken op een stack-kaart selecteert die PR. Wordt door Cockpit gewired. */
  onSelectPr?: (key: string) => void;
  /** Opent de PR-inspector op de gegeven tab. */
  onOpenInspector: (tab: "diff" | "comments") => void;
  /** Uit als een sheet of menu open staat: dan mogen M/R/⌘⏎ niet triggeren. */
  shortcutsEnabled: boolean;
  /** Opent de instellingensheet. Ontbreekt dit, dan is het tandwiel decoratief. */
  onOpenSettings?: () => void;
  /** Aantal geselecteerde rijen bij een multi-selectie (Cockpit's "N
   * geselecteerd"-chip); 1 of undefined betekent geen multi-selectie, dus
   * geen banner. */
  selectedCount?: number;
}

export function DetailPanel({
  pr,
  stackInfo,
  stackChain,
  onSetPriority,
  priorityError,
  onMergePr,
  clis,
  repoPath,
  run,
  onStartRun,
  onCancelRun,
  onRepoLinked,
  settings,
  allPrs,
  runningPrKeys,
  onBulkStart,
  meLogin,
  onSelectPr = () => {},
  onOpenInspector,
  shortcutsEnabled,
  onOpenSettings,
  selectedCount,
}: DetailPanelProps) {
  if (!pr) {
    return (
      <aside className="detail-panel">
        <div className="detail-panel-empty">
          <p>
            Selecteer een PR in de lijst. Pijltjes navigeren, R start een
            agent-review, M merget, Enter opent op GitHub.
          </p>
        </div>
      </aside>
    );
  }

  const runningHere = run?.status === "running";
  const stackBlocked = (stackInfo?.blockedByPrNumbers.length ?? 0) > 0;
  const status = prStatus(pr, { agentBezig: runningHere, stackBlocked });

  const preferred = preferredReviewer(pr.author);
  const agentOrder: ReviewAgent[] =
    preferred === "claude" ? ["claude", "codex"] : ["codex", "claude"];

  function disabledReason(agent: ReviewAgent): string | null {
    if (!clis[agent]) {
      return `de ${agent}-CLI is niet gevonden op deze machine`;
    }
    if (repoPath == null || repoPath === "") {
      return "koppel eerst de lokale map van dit project";
    }
    if (run?.status === "running") {
      return "er loopt al een review voor deze PR";
    }
    return null;
  }

  const authorEntry: PersonEntry = {
    author: pr.author,
    note: pr.authoredByMe ? "jij" : "",
  };
  const assigneeEntries: PersonEntry[] = pr.assignees.map((login) => ({
    author: deriveAuthor(login),
    note: login === meLogin ? "jij" : "",
  }));
  const reviewerEntries: PersonEntry[] = pr.reviewers.map((reviewer) => ({
    author: deriveAuthor(reviewer.login),
    note:
      (reviewer.login === meLogin ? "jij · " : "") +
      REVIEWER_STATE_LABEL[reviewer.state],
    reviewerState: reviewer.state,
  }));

  const totalLines = pr.additions + pr.deletions;

  return (
    <aside className="detail-panel">
      {selectedCount != null && selectedCount > 1 && (
        <p className="detail-multi-select-note">
          {selectedCount} geselecteerd. De acties hieronder gelden alleen voor #
          {pr.number}; gebruik het rechtsklikmenu voor bulk.
        </p>
      )}
      <div className="detail-head">
        <div className="detail-chips">
          <span
            className="detail-chip detail-chip-status"
            style={{ color: STATUS_COLOR[status.key] }}
          >
            {status.label}
          </span>
          {pr.priority === 1 && (
            <span className="detail-chip detail-chip-prio1">P1</span>
          )}
          {pr.priority === 2 && (
            <span className="detail-chip detail-chip-prio2">P2</span>
          )}
          {pr.isDraft && (
            <span className="detail-chip detail-chip-draft">
              <ConceptIcon size={9} />
              concept
            </span>
          )}
          {stackInfo != null && stackInfo.stackSize > 1 && (
            <span className="detail-chip detail-chip-stack mono">
              <StackIcon />
              stapel {stackInfo.stackPosition}/{stackInfo.stackSize}
            </span>
          )}
          <span className="detail-chip">
            {REVIEW_LABEL[pr.reviewState.state]}
          </span>
        </div>
        <h2 className="detail-title">{pr.title}</h2>
        <p className="detail-slug mono" title={`${pr.repoId} #${pr.number}`}>
          {pr.repoId} #{pr.number}
        </p>
      </div>

      <div className="detail-body">
        <CiStatus ciStatus={pr.ciStatus} />

        <StackRail pr={pr} stackChain={stackChain} onSelectPr={onSelectPr} />

        <div className="detail-meta">
          <span className="detail-label">Branch</span>
          <span
            className="detail-meta-value"
            title={`${pr.headRef} → ${pr.baseRef}`}
          >
            {pr.headRef} → {pr.baseRef}
          </span>
          <span className="detail-label">Diff</span>
          <button
            type="button"
            className="detail-meta-value detail-meta-link"
            title="Bekijk in de app (D)"
            onClick={() => onOpenInspector("diff")}
          >
            +{pr.additions} −{pr.deletions} ({totalLines} regels,{" "}
            {sizeWord(totalLines)})
          </button>
          <span className="detail-label">Reacties</span>
          <button
            type="button"
            className="detail-meta-value detail-meta-link"
            title="Bekijk in de app (D)"
            onClick={() => onOpenInspector("comments")}
          >
            {pr.comments} {pr.comments === 1 ? "reactie" : "reacties"}
          </button>
          <span className="detail-label">Aangemaakt</span>
          <span className="detail-meta-value">
            {formatAmsterdam(pr.createdAt)}
          </span>
          <span className="detail-label">Bijgewerkt</span>
          <span className="detail-meta-value">
            {formatRelative(pr.updatedAt)} geleden
          </span>
        </div>

        <div className="detail-people">
          <PeopleColumn
            label="Auteur"
            entries={[authorEntry]}
            emptyLabel="onbekend"
            meLogin={meLogin}
          />
          <PeopleColumn
            label="Assignee"
            entries={assigneeEntries}
            emptyLabel="geen assignee"
            meLogin={meLogin}
          />
          <PeopleColumn
            label="Reviewers"
            entries={reviewerEntries}
            emptyLabel="geen review gevraagd"
            meLogin={meLogin}
          />
        </div>

        <PrioritySegmented
          repoId={pr.repoId}
          prNumber={pr.number}
          priority={pr.priority}
          onSetPriority={onSetPriority}
          error={priorityError}
        />

        {runningHere ? null : (
          <div className="detail-agents">
            <div className="detail-agents-head">
              <span className="detail-label">Laten reviewen</span>
              <span className="detail-agents-rule" />
              <button
                type="button"
                className="icon-button"
                title="Model en effort instellen"
                onClick={onOpenSettings}
              >
                <SettingsIcon />
              </button>
            </div>
            {agentOrder.map((agent) => (
              <AgentButtons
                key={agent}
                pr={pr}
                agent={agent}
                primary={agent === preferred}
                primaryMode={settings.review.primaryMode}
                modelLine={`${settings[agent].model} · ${settings[agent].effort}`}
                disabledReason={disabledReason(agent)}
                onStartRun={onStartRun}
              />
            ))}
            <ReviewHistory pr={pr} />
            <BulkReviewButton
              prs={allPrs}
              runningPrKeys={runningPrKeys}
              mode={
                settings.review.primaryMode === "withFixes"
                  ? "comments + fixes"
                  : "alleen comments"
              }
              onStart={onBulkStart}
            />
          </div>
        )}

        {run && <AgentLogPanel run={run} onCancel={onCancelRun} />}

        {(repoPath == null || repoPath === "") && (
          <RepoPathSetup repoId={pr.repoId} onLinked={onRepoLinked} />
        )}
      </div>

      <div className="detail-foot">
        <MergeSection
          key={pr.id}
          pr={pr}
          stackInfo={stackInfo}
          onMergePr={onMergePr}
          shortcutsEnabled={shortcutsEnabled}
        />
        <button
          type="button"
          className="detail-github-button"
          onClick={() => void openUrl(pr.url)}
        >
          <ExternalLinkIcon /> Open op GitHub
          <span className="detail-github-kbd mono">⏎</span>
        </button>
      </div>
    </aside>
  );
}
