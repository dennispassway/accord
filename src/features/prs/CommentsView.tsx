import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import type { PrComment, ReviewThread } from "../../lib/github/prDetail";
import { errorMessage } from "../update/updateState";
import { Avatar } from "./Avatar";
import { CommentBody } from "./commentMarkdown";
import { formatRelative } from "./format";
import "./inspector.css";

export interface ThreadActions {
  onReply: (threadId: string, body: string) => Promise<void>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<void>;
  /** Concept-antwoorden per threadKey; een aanwezige sleutel betekent dat het
   * antwoordveld openstaat. Een ref-map boven de thread, zodat een concept een
   * weergavewissel of inklappen overleeft zonder bij elke toets te renderen. */
  drafts: Map<string, string>;
  /** Lopende verzendingen per threadKey (resolvet met de fout of null), zodat
   * een remount tijdens het verzenden niet opnieuw kan versturen. */
  sending: Map<string, Promise<string | null>>;
}

/** Sleutel voor React en voor concepten; een thread zonder id valt terug op
 * pad en regel. */
function threadKey(thread: ReviewThread): string {
  return thread.id || `${thread.path}-${thread.line}`;
}

interface CommentsViewProps extends ThreadActions {
  issueComments: PrComment[];
  elsewhereThreads: ReviewThread[];
}

function CommentRow({ comment }: { comment: PrComment }) {
  return (
    <div className="inspector-comment">
      <Avatar author={comment.author} size={18} />
      <div className="inspector-comment-body">
        <div className="inspector-comment-head">
          <span className="inspector-comment-login">
            {comment.author.login}
          </span>
          <span className="inspector-comment-time">
            {formatRelative(comment.createdAt)} geleden
          </span>
        </div>
        <div className="inspector-comment-text">
          <CommentBody>{comment.body}</CommentBody>
        </div>
      </div>
    </div>
  );
}

interface ThreadItemProps extends ThreadActions {
  thread: ReviewThread;
  showLocation: boolean;
  showSide: boolean;
}

function ThreadItem({
  thread,
  onReply,
  onSetResolved,
  drafts,
  sending,
  showLocation,
  showSide,
}: ThreadItemProps) {
  const key = threadKey(thread);
  // Het concept leeft in de ref-map; deze state is de lokale spiegel, gelezen
  // bij mount en opnieuw zodra een lopende verzending klaar is.
  const [draft, setDraft] = useState<string | undefined>(() => drafts.get(key));
  const replyOpen = draft !== undefined;
  const [busy, setBusy] = useState(() => sending.has(key));
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusOnOpen = useRef(false);
  const mounted = useRef(false);

  // Een antwoord kan landen nadat de thread is ingeklapt of van weergave
  // gewisseld (unmount): dan geen setState op het oude exemplaar. Een nieuw
  // exemplaar dat tijdens een lopende verzending mount, wacht op diezelfde
  // verzending. Een test vangt dit hier niet (geen jsdom).
  // biome-ignore lint/correctness/useExhaustiveDependencies: alleen bij mount
  useEffect(() => {
    mounted.current = true;
    const pending = sending.get(key);
    // De verzending kan tussen render en dit effect al klaar zijn: dan de
    // begintoestand corrigeren, anders blijft busy staan.
    if (pending === undefined) {
      setBusy(false);
      setDraft(drafts.get(key));
      return () => {
        mounted.current = false;
      };
    }
    pending.then((failure) => {
      if (!mounted.current) return;
      setBusy(false);
      setDraft(drafts.get(key));
      if (failure) setError(failure);
    });
    return () => {
      mounted.current = false;
    };
  }, []);

  // Alleen na een klik op "Beantwoorden": een remount mag de focus niet pakken.
  useEffect(() => {
    if (replyOpen && focusOnOpen.current) {
      focusOnOpen.current = false;
      textareaRef.current?.focus();
    }
  }, [replyOpen]);

  function openReply() {
    focusOnOpen.current = true;
    drafts.set(key, "");
    setDraft("");
  }

  function changeDraft(text: string) {
    drafts.set(key, text);
    setDraft(text);
  }

  function closeReply() {
    drafts.delete(key);
    setDraft(undefined);
  }

  async function submitReply() {
    const trimmed = (draft ?? "").trim();
    if (trimmed === "" || busy || sending.has(key)) return;
    setBusy(true);
    setError(null);
    const run = onReply(thread.id, trimmed).then(
      () => {
        drafts.delete(key);
        return null;
      },
      // Niet elke afwijzing is een Error (get_token geeft een kale string).
      (failure: unknown) => errorMessage(failure),
    );
    sending.set(key, run);
    const failure = await run;
    sending.delete(key);
    if (!mounted.current) return;
    setBusy(false);
    if (failure) setError(failure);
    else setDraft(undefined);
  }

  async function toggleResolved() {
    if (busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSetResolved(thread.id, !thread.isResolved);
    } catch (toggleError) {
      setError((toggleError as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="inspector-thread">
      {(showLocation || showSide || thread.isResolved) && (
        <div className="inspector-thread-head">
          {showLocation && (
            <span className="inspector-thread-location">
              {thread.path}
              {thread.line !== null ? `:${thread.line}` : ""}
            </span>
          )}
          {showSide && (
            <span className="inspector-thread-side">
              {thread.diffSide === "LEFT" ? "oud" : "nieuw"}
            </span>
          )}
          {thread.isResolved && (
            <span className="inspector-thread-resolved">opgelost</span>
          )}
        </div>
      )}
      <div className="inspector-comments-list">
        {thread.comments.map((comment) => (
          <CommentRow
            key={`${comment.author.login}-${comment.createdAt}`}
            comment={comment}
          />
        ))}
      </div>
      <div className="inspector-thread-actions">
        {thread.viewerCanReply && !replyOpen && (
          <button
            type="button"
            className="inspector-thread-action"
            disabled={busy}
            onClick={openReply}
          >
            Beantwoorden
          </button>
        )}
        {!thread.isResolved && thread.viewerCanResolve && (
          <button
            type="button"
            className="inspector-thread-action"
            disabled={busy}
            onClick={() => void toggleResolved()}
          >
            Oplossen
          </button>
        )}
        {thread.isResolved && thread.viewerCanUnresolve && (
          <button
            type="button"
            className="inspector-thread-action"
            disabled={busy}
            onClick={() => void toggleResolved()}
          >
            Heropenen
          </button>
        )}
      </div>
      {replyOpen && (
        <div className="inspector-thread-reply">
          <textarea
            className="inspector-thread-textarea"
            ref={textareaRef}
            value={draft}
            disabled={busy}
            placeholder="Schrijf een reactie…"
            onChange={(event) => changeDraft(event.target.value)}
            onKeyDown={(event) => {
              if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                event.preventDefault();
                void submitReply();
              } else if (event.key === "Escape") {
                // Esc sluit alleen de textarea, niet de inspector: die
                // luistert op window-niveau (Cockpit.tsx), dus stopPropagation
                // voorkomt dat het venster de sneltoets ook verwerkt.
                event.stopPropagation();
                closeReply();
              }
            }}
          />
          <div className="inspector-thread-reply-actions">
            <button
              type="button"
              className="inspector-github-button"
              disabled={busy || draft.trim() === ""}
              onClick={() => void submitReply()}
            >
              Versturen
            </button>
          </div>
        </div>
      )}
      {error != null && <p className="inspector-thread-error">{error}</p>}
    </div>
  );
}

/** `showLocation` uit als de threads al onder hun regel staan: pad:regel is
 * daar dubbel. `showSide` toont of de regel aan de oude of nieuwe kant zit. */
export function ThreadList({
  threads,
  showLocation,
  showSide = false,
  ...actions
}: {
  threads: ReviewThread[];
  showLocation: boolean;
  showSide?: boolean;
} & ThreadActions) {
  return (
    <div className="inspector-thread-list">
      {threads.map((thread) => (
        <ThreadItem
          key={threadKey(thread)}
          thread={thread}
          showLocation={showLocation}
          showSide={showSide}
          {...actions}
        />
      ))}
    </div>
  );
}

/** Inhoud van de Gesprek-sectie: issue-comments en threads die bij geen
 * diffbestand horen. Inline threads staan in DiffView. */
export function CommentsView({
  issueComments,
  elsewhereThreads,
  ...actions
}: CommentsViewProps): ReactNode {
  if (issueComments.length === 0 && elsewhereThreads.length === 0) {
    return (
      <p className="inspector-comments-empty">Nog geen algemene reacties.</p>
    );
  }

  return (
    <>
      {issueComments.length > 0 && (
        <div className="inspector-comments-list">
          {issueComments.map((comment) => (
            <CommentRow
              key={`${comment.author.login}-${comment.createdAt}`}
              comment={comment}
            />
          ))}
        </div>
      )}
      {elsewhereThreads.length > 0 && (
        <div className="inspector-comments-section">
          <h4 className="inspector-comments-subheading">
            Review-threads elders
          </h4>
          <ThreadList threads={elsewhereThreads} showLocation {...actions} />
        </div>
      )}
    </>
  );
}
