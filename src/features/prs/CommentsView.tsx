import { openUrl } from "@tauri-apps/plugin-opener";
import type { PrComment, ReviewThread } from "../../lib/github/prDetail";
import { Avatar } from "./Avatar";
import { formatRelative } from "./format";
import "./inspector.css";

interface CommentsViewProps {
  issueComments: PrComment[];
  reviewThreads: ReviewThread[];
  url: string;
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
        <p className="inspector-comment-text">{comment.bodyText}</p>
      </div>
    </div>
  );
}

export function CommentsView({
  issueComments,
  reviewThreads,
  url,
}: CommentsViewProps) {
  if (issueComments.length === 0 && reviewThreads.length === 0) {
    return (
      <div className="inspector-empty">
        <p>Nog geen reacties.</p>
        <button
          type="button"
          className="inspector-github-button"
          onClick={() => void openUrl(url)}
        >
          Open op GitHub
        </button>
      </div>
    );
  }

  return (
    <div className="inspector-comments">
      {issueComments.length > 0 && (
        <section className="inspector-comments-section">
          <h3 className="inspector-comments-heading">Gesprek</h3>
          <div className="inspector-comments-list">
            {issueComments.map((comment) => (
              <CommentRow
                key={`${comment.author.login}-${comment.createdAt}`}
                comment={comment}
              />
            ))}
          </div>
        </section>
      )}

      {reviewThreads.length > 0 && (
        <section className="inspector-comments-section">
          <h3 className="inspector-comments-heading">Review-threads</h3>
          <div className="inspector-comments-list">
            {reviewThreads.map((thread) => (
              <div
                key={`${thread.path}-${thread.line}-${thread.comments[0]?.createdAt}`}
                className="inspector-thread"
              >
                <div className="inspector-thread-head">
                  <span className="inspector-thread-location">
                    {thread.path}
                    {thread.line !== null ? `:${thread.line}` : ""}
                  </span>
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
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
