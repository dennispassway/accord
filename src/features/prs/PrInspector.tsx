import { openUrl } from "@tauri-apps/plugin-opener";
import { useEffect, useMemo, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { DraftThread, ReviewEvent } from "../../lib/github/review";
import { CommentsView } from "./CommentsView";
import { type DiffViewMode, loadDiffView, saveDiffView } from "./cockpitPrefs";
import { DiffView } from "./DiffView";
import { groupThreadsByFile } from "./diffModel";
import { FinishReview } from "./FinishReview";
import { CloseIcon, ExternalLinkIcon } from "./icons";
import "./inspector.css";
import { PrDescription } from "./PrDescription";
import { keyOfPr } from "./PrList";
import type { DraftActions } from "./ReviewComposer";
import {
  draftsOutsideDiff,
  reviewDraftStore,
  useReviewDrafts,
} from "./reviewDrafts";
import { usePrDetail } from "./usePrDetail";
import { latestVerdict, VerdictBadge } from "./VerdictBadge";

export type InspectorSection = "diff" | "comments";

const DIFF_VIEW_LABELS: Record<DiffViewMode, string> = {
  unified: "Unified",
  split: "Split",
};

interface PrInspectorProps {
  pr: PullRequest;
  initialSection: InspectorSection;
  onClose: () => void;
  onAuthError: () => void;
  /** Start een fixComments-run; afwezig als dat nu niet kan (run bezig). */
  onFixComments?: () => void;
  /** Verstuurt een review; de concepten gaan mee (usePrs.submitReview). */
  onSubmitReview: (event: ReviewEvent, body: string) => Promise<void>;
  /** Verstuurt één opmerking los als eigen review. */
  onSubmitThread: (thread: DraftThread) => Promise<void>;
}

/** Zelfde scrim/sheet-patroon als SettingsSheet, maar breder en met eigen
 * z-index (32/33) zodat hij boven de settings-sheet kan. */
export function PrInspector({
  pr,
  initialSection,
  onClose,
  onAuthError,
  onFixComments,
  onSubmitReview,
  onSubmitThread,
}: PrInspectorProps) {
  const [mode, setMode] = useState<DiffViewMode>(loadDiffView);
  const conversationRef = useRef<HTMLElement>(null);
  const scrolledRef = useRef(false);
  const {
    status,
    detail,
    error,
    retry,
    reply,
    setResolved,
    files,
    diffTooLarge,
    loadFileLines,
    loadPerFile,
    refetch,
  } = usePrDetail(pr, onAuthError);
  const prKey = keyOfPr(pr);
  const reviewDrafts = useReviewDrafts(prKey);
  // Een regel die in de diff zelf ontbreekt kan GitHub weigeren. Zonder
  // volledige diff (te groot, nog niet per bestand geladen) is er niets om
  // tegen te toetsen: dan geen waarschuwing.
  const outsideDiff = useMemo(
    () =>
      status === "ready" && !diffTooLarge
        ? draftsOutsideDiff(reviewDrafts, files)
        : new Set<string>(),
    [status, diffTooLarge, reviewDrafts, files],
  );

  const verdict = latestVerdict(pr);

  const { byPath, elsewhere } = useMemo(
    () => groupThreadsByFile(files, detail?.reviewThreads ?? []),
    [files, detail],
  );
  // Refs i.p.v. state: een toetsaanslag in een antwoord mag de diff niet
  // opnieuw renderen.
  const drafts = useRef(new Map<string, string>());
  const sending = useRef(new Map<string, Promise<string | null>>());

  // Een opmerking die al wordt verstuurd mag niet nog eens: ook niet vanuit
  // een opstelveld dat intussen opnieuw is gemount.
  const looseSending = useRef(new Set<string>());

  async function sendLoose(thread: DraftThread) {
    const key = `${thread.path}\0${thread.side}\0${thread.line}`;
    if (looseSending.current.has(key)) {
      throw new Error("Deze opmerking wordt al verstuurd");
    }
    looseSending.current.add(key);
    try {
      await onSubmitThread(thread);
    } finally {
      looseSending.current.delete(key);
    }
    void refetch();
  }

  const draftActions: DraftActions = {
    drafts: reviewDrafts,
    onAdd: (input) => {
      reviewDraftStore.add(prKey, input);
    },
    onEdit: (id, body) => reviewDraftStore.edit(prKey, id, body),
    onRemove: (id) => reviewDraftStore.remove(prKey, [id]),
    onSendLoose: sendLoose,
  };

  const threadActions = {
    onReply: reply,
    onSetResolved: setResolved,
    drafts: drafts.current,
    sending: sending.current,
  };

  // Eenmalig naar het gesprek scrollen als de inspector daarvoor geopend is.
  // Pas na status "ready": eerder bestaat de sectie niet.
  useEffect(() => {
    if (status !== "ready" || initialSection !== "comments") return;
    if (scrolledRef.current) return;
    scrolledRef.current = true;
    conversationRef.current?.scrollIntoView({ block: "start" });
  }, [status, initialSection]);

  function changeMode(next: DiffViewMode) {
    setMode(next);
    saveDiffView(next);
  }

  return (
    <>
      <button
        type="button"
        className="inspector-scrim"
        aria-label="Sluit PR-inspector"
        onClick={onClose}
      />
      <div className="inspector-sheet">
        <div className="inspector-head">
          <span className="inspector-head-title">{pr.title}</span>
          <span className="inspector-head-slug mono">
            {pr.repoId} #{pr.number}
          </span>
          {verdict && <VerdictBadge verdict={verdict} />}
          {verdict?.fixes === "nodig" &&
            pr.openThreads > 0 &&
            onFixComments && (
              <button
                type="button"
                className="inspector-github-button"
                onClick={onFixComments}
              >
                Fix nu
              </button>
            )}
          <FinishReview
            key={prKey}
            drafts={reviewDrafts}
            outsideDiff={outsideDiff}
            onRemoveDraft={(id) => reviewDraftStore.remove(prKey, [id])}
            onDiscard={() => reviewDraftStore.clear(prKey)}
            onSubmit={onSubmitReview}
            onSubmitted={() => void refetch()}
          />
          <fieldset className="inspector-segmented" aria-label="Weergave">
            {(Object.keys(DIFF_VIEW_LABELS) as DiffViewMode[]).map((m) => (
              <button
                key={m}
                type="button"
                aria-pressed={mode === m}
                className={
                  mode === m
                    ? "inspector-segmented-option active"
                    : "inspector-segmented-option"
                }
                onClick={() => changeMode(m)}
              >
                {DIFF_VIEW_LABELS[m]}
              </button>
            ))}
          </fieldset>
          <button
            type="button"
            className="icon-button"
            title="Open op GitHub"
            onClick={() => void openUrl(pr.url)}
          >
            <ExternalLinkIcon />
          </button>
          <button
            type="button"
            className="inspector-close"
            title="Sluiten (esc)"
            onClick={onClose}
          >
            <CloseIcon />
          </button>
        </div>
        <div className="inspector-body">
          {status === "loading" && (
            <div className="inspector-empty">
              <p>Diff en reacties ophalen…</p>
            </div>
          )}
          {status === "error" && (
            <div className="inspector-empty">
              <p>{error}</p>
              <div className="inspector-error-actions">
                <button
                  type="button"
                  className="inspector-github-button"
                  onClick={retry}
                >
                  Opnieuw
                </button>
                <button
                  type="button"
                  className="inspector-github-button"
                  onClick={() => void openUrl(pr.url)}
                >
                  Open op GitHub
                </button>
              </div>
            </div>
          )}
          {status === "ready" && detail != null && (
            <>
              <PrDescription
                body={detail.body}
                fileCount={diffTooLarge ? undefined : files.length}
                add={pr.additions}
                del={pr.deletions}
              />
              {/* De key (PR + commit) zet alle lokale uitklap- en laadstaat
                  terug: een antwoord dat na een wissel landt, belandt dan
                  op een weggehaald component (async-antwoord-na-wissel.md). */}
              <DiffView
                key={`${keyOfPr(pr)}:${detail.headSha}`}
                files={files}
                tooLarge={diffTooLarge}
                url={pr.url}
                mode={mode}
                threadsByPath={byPath}
                loadFileLines={
                  detail.headSha === "" ? undefined : loadFileLines
                }
                onLoadPerFile={loadPerFile}
                review={draftActions}
                {...threadActions}
              />
              <section
                ref={conversationRef}
                className="inspector-comments-section inspector-conversation"
              >
                <h3 className="inspector-comments-heading">Gesprek</h3>
                <CommentsView
                  issueComments={detail.issueComments}
                  elsewhereThreads={elsewhere}
                  {...threadActions}
                />
              </section>
            </>
          )}
        </div>
      </div>
    </>
  );
}
