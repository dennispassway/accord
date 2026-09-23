import { openUrl } from "@tauri-apps/plugin-opener";
import { useRef } from "react";
import type { Author, PullRequest } from "../../lib/github/domain";
import { deriveAuthor } from "../../lib/github/domain";
import type { MergeMethod } from "../../lib/github/merge";
import type { ReviewEvent } from "../../lib/github/review";
import type { PrStackInfo } from "../../lib/github/stacks";
import type { Settings } from "../../lib/settings";
import { AgentLogPanel } from "../agents/AgentLogPanel";
import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import {
  availableFixModes,
  preferredFixer,
  preferredReviewer,
} from "../agents/crossReview";
import { RepoPathSetup } from "../agents/RepoPathSetup";
import type { AgentClis, AgentRun } from "../agents/useAgentRuns";
import { AgentButtons, altReviewMode } from "./AgentButtons";
import { Avatar } from "./Avatar";
import { BulkReviewButton } from "./BulkReviewButton";
import { CiStatus } from "./CiStatus";
import "./detail.css";
import { formatAmsterdam, formatRelative, formatSnoozeUntil } from "./format";
import {
  ConceptIcon,
  ExternalLinkIcon,
  SettingsIcon,
  StackIcon,
} from "./icons";
import { MergeSection } from "./MergeSection";
import { ReviewActions } from "./ReviewActions";
import { ReviewHistory } from "./ReviewHistory";
import { sizeWord } from "./RowMetrics";
import type { PrStatusKey } from "./rank";
import { prStatus } from "./rank";
import type { StackRebaseStatus } from "./StackRail";
import { StackRail } from "./StackRail";

/** Verbergt tekst visueel maar houdt hem beschikbaar voor schermlezers. */
const VISUALLY_HIDDEN_STYLE = {
  position: "absolute",
  width: 1,
  height: 1,
  padding: 0,
  margin: -1,
  overflow: "hidden",
  clip: "rect(0, 0, 0, 0)",
  whiteSpace: "nowrap",
  border: 0,
} as const;

const STATUS_COLOR: Record<PrStatusKey, string> = {
  klaar: "var(--ok)",
  review: "var(--accent)",
  actie: "var(--err)",
  wachtReview: "var(--warn)",
  agent: "var(--agent)",
  wachten: "var(--warn)",
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
  onMergePr: (pr: PullRequest, method: MergeMethod) => Promise<void>;
  /** U1/D4/D8: goedkeuren, changes vragen en reageren vanuit het paneel.
   * Verschijnt boven MergeSection zodra een review van de gebruiker gevraagd
   * is en de PR niet van hemzelf is. */
  onSubmitReview: (
    pr: PullRequest,
    event: ReviewEvent,
    body: string,
  ) => Promise<void>;
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
  /** Wisselt settings.autoRebaseStacks. Gewired in Cockpit voor StackRail. */
  onToggleAutoRebase: () => void;
  /** Status van een lopende auto-rebase na een merge, zie StackRail. */
  stackRebaseStatus?: StackRebaseStatus | null;
  /** ISO-instant waarop de geselecteerde PR terugkeert uit "Later", als hij
   * gesnoozed is. */
  snoozeUntil?: string;
}

export function DetailPanel({
  pr,
  stackInfo,
  stackChain,
  onMergePr,
  onSubmitReview,
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
  onToggleAutoRebase,
  stackRebaseStatus,
  snoozeUntil,
}: DetailPanelProps) {
  const fixCardRef = useRef<HTMLDivElement>(null);

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
  // Fixen is een eigen stap met een eigen agentkeuze, zodat de ene agent kan
  // reviewen en de andere de bevindingen verwerkt. Blokkerend werk eerst
  // (conflict, checks), dan de comments; de rest achter het chevron.
  const [primaryFix, ...menuFixes] = availableFixModes(pr);
  const fixer = preferredFixer(pr);
  const fixerOrder: ReviewAgent[] =
    fixer === "claude" ? ["claude", "codex"] : ["codex", "claude"];
  const { primaryMode } = settings.review;
  // De modelregel volgt de knop: Comments draait op het leesmodel.
  const reviewModel = (agent: ReviewAgent) =>
    primaryMode === "commentsOnly"
      ? settings[agent].commentsOnlyModel
      : settings[agent].model;

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
  const reviewRequestedFromMe = pr.reviewRequestedFromMe && !pr.authoredByMe;

  const canJumpToFix =
    !runningHere &&
    primaryFix != null &&
    (status.problem != null || status.key === "actie");
  const fixHintId = `detail-fix-hint-${pr.number}`;
  function scrollToFixCard() {
    const card = fixCardRef.current;
    if (card == null) return;
    const reduceMotion = window.matchMedia(
      "(prefers-reduced-motion: reduce)",
    ).matches;
    card.scrollIntoView({
      behavior: reduceMotion ? "auto" : "smooth",
      block: "center",
    });
    card.querySelector<HTMLButtonElement>("button")?.focus();
  }

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
          {canJumpToFix ? (
            <button
              type="button"
              className="detail-chip detail-chip-status detail-chip-status-button"
              style={{ color: STATUS_COLOR[status.key] }}
              title="Ga naar Laten fixen"
              aria-describedby={fixHintId}
              onClick={scrollToFixCard}
            >
              {status.label}
              <span id={fixHintId} style={VISUALLY_HIDDEN_STYLE}>
                , ga naar Laten fixen
              </span>
            </button>
          ) : (
            <span
              className="detail-chip detail-chip-status"
              style={{ color: STATUS_COLOR[status.key] }}
            >
              {status.label}
            </span>
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
          {snoozeUntil != null && (
            <span
              className="detail-chip detail-chip-snooze"
              title={`Terug op ${formatAmsterdam(snoozeUntil)}`}
            >
              later tot {formatSnoozeUntil(snoozeUntil)}
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

        <StackRail
          pr={pr}
          stackChain={stackChain}
          onSelectPr={onSelectPr}
          autoRebaseEnabled={settings.autoRebaseStacks}
          onToggleAutoRebase={onToggleAutoRebase}
          rebaseStatus={stackRebaseStatus}
        />

        <div className="detail-meta detail-card">
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

        <div className="detail-people detail-card">
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

        {runningHere ? null : (
          <div className="detail-agents detail-card">
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
                primaryMode={primaryMode}
                menuModes={[altReviewMode(primaryMode)]}
                modelLine={`${reviewModel(agent)} · ${settings[agent].effort}`}
                disabledReason={disabledReason(agent)}
                onStartRun={onStartRun}
              />
            ))}
            <ReviewHistory pr={pr} />
            <BulkReviewButton
              prs={allPrs}
              runningPrKeys={runningPrKeys}
              mode={
                primaryMode === "withFixes"
                  ? "comments + fixes"
                  : "alleen comments"
              }
              onStart={onBulkStart}
            />
          </div>
        )}

        {runningHere || primaryFix == null ? null : (
          <div className="detail-agents detail-card" ref={fixCardRef}>
            <div className="detail-agents-head">
              <span className="detail-label">Laten fixen</span>
              <span className="detail-agents-rule" />
            </div>
            {fixerOrder.map((agent) => (
              <AgentButtons
                key={agent}
                pr={pr}
                agent={agent}
                primary={false}
                primaryMode={primaryFix}
                menuModes={menuFixes}
                modelLine={`${settings[agent].model} · ${settings[agent].effort}`}
                disabledReason={disabledReason(agent)}
                onStartRun={onStartRun}
              />
            ))}
          </div>
        )}

        {/* key per run: anders blijft een uitgeklapte volledige log van de
            vorige PR staan (en landt een late fetch) onder deze run. */}
        {run && (
          <AgentLogPanel key={run.runId} run={run} onCancel={onCancelRun} />
        )}

        {(repoPath == null || repoPath === "") && (
          <RepoPathSetup repoId={pr.repoId} onLinked={onRepoLinked} />
        )}
      </div>

      <div className="detail-foot">
        {reviewRequestedFromMe && (
          <ReviewActions
            key={`review-${pr.id}`}
            pr={pr}
            onSubmitReview={onSubmitReview}
            shortcutsEnabled={shortcutsEnabled}
          />
        )}
        <MergeSection
          key={`merge-${pr.id}`}
          pr={pr}
          stackInfo={stackInfo}
          onMergePr={onMergePr}
          shortcutsEnabled={shortcutsEnabled}
          variant={reviewRequestedFromMe ? "secondary" : "primary"}
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
