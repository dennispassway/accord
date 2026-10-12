import type { ReactNode } from "react";
import { useState } from "react";
import type { PrComment, ReviewThread } from "../../lib/github/prDetail";
import { Avatar } from "./Avatar";
import { CommentBody } from "./commentMarkdown";
import { formatRelative } from "./format";
import "./inspector.css";

interface CommentsViewProps {
  issueComments: PrComment[];
  elsewhereThreads: ReviewThread[];
  onReply: (threadId: string, body: string) => Promise<void>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<void>;
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

interface ThreadItemProps {
  thread: ReviewThread;
  onReply: (threadId: string, body: string) => Promise<void>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<void>;
  /** Uit als de thread al onder zijn regel staat: pad:regel is daar dubbel. */
  showLocation?: boolean;
}

export function ThreadItem({
  thread,
  onReply,
  onSetResolved,
  showLocation = true,
}: ThreadItemProps) {
  const [replyOpen, setReplyOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function closeReply() {
    setReplyOpen(false);
    setDraft("");
  }

  async function submitReply() {
    const trimmed = draft.trim();
    if (trimmed === "" || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onReply(thread.id, trimmed);
      closeReply();
    } catch (submitError) {
      setError((submitError as Error).message);
    } finally {
      setBusy(false);
    }
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
      <div className="inspector-thread-head">
        {showLocation && (
          <span className="inspector-thread-location">
            {thread.path}
            {thread.line !== null ? `:${thread.line}` : ""}
          </span>
        )}
        {thread.isResolved && (
          <span className="inspector-thread-resolved">opgelost</span>
        )}
      </div>
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
            onClick={() => setReplyOpen(true)}
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
            // biome-ignore lint/a11y/noAutofocus: de gebruiker klikte net op "Beantwoorden", verwacht direct te kunnen typen
            autoFocus
            value={draft}
            disabled={busy}
            placeholder="Schrijf een reactie…"
            onChange={(event) => setDraft(event.target.value)}
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

/** Inhoud van de Gesprek-sectie: issue-comments en threads die bij geen
 * diffbestand horen. Inline threads staan in DiffView. */
export function CommentsView({
  issueComments,
  elsewhereThreads,
  onReply,
  onSetResolved,
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
          <div className="inspector-comments-list">
            {elsewhereThreads.map((thread) => (
              <ThreadItem
                key={thread.id || `${thread.path}-${thread.line}`}
                thread={thread}
                onReply={onReply}
                onSetResolved={onSetResolved}
              />
            ))}
          </div>
        </div>
      )}
    </>
  );
}
