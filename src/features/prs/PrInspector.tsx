import { openUrl } from "@tauri-apps/plugin-opener";
import { useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import { CommentsView } from "./CommentsView";
import { DiffView } from "./DiffView";
import { CloseIcon, ExternalLinkIcon } from "./icons";
import "./inspector.css";
import { usePrDetail } from "./usePrDetail";

type InspectorTab = "diff" | "comments";

interface PrInspectorProps {
  pr: PullRequest;
  initialTab: InspectorTab;
  onClose: () => void;
  onAuthError: () => void;
}

/**
 * PR-inspector: diff en reacties on-demand, geopend vanuit het detailpaneel
 * of via toets D. Zelfde scrim/sheet-patroon als SettingsSheet, maar breder
 * en met eigen z-index (32/33) zodat hij boven de settings-sheet kan.
 */
export function PrInspector({
  pr,
  initialTab,
  onClose,
  onAuthError,
}: PrInspectorProps) {
  const [tab, setTab] = useState<InspectorTab>(initialTab);
  const { status, detail, error, retry } = usePrDetail(pr, onAuthError);

  const commentCount =
    detail != null
      ? detail.issueComments.length + detail.reviewThreads.length
      : null;

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
        <div className="inspector-tabs" role="tablist">
          <button
            type="button"
            role="tab"
            aria-selected={tab === "diff"}
            className={
              tab === "diff" ? "inspector-tab active" : "inspector-tab"
            }
            onClick={() => setTab("diff")}
          >
            Diff
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={tab === "comments"}
            className={
              tab === "comments" ? "inspector-tab active" : "inspector-tab"
            }
            onClick={() => setTab("comments")}
          >
            Reacties{commentCount != null ? ` (${commentCount})` : ""}
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
          {status === "ready" &&
            detail != null &&
            (tab === "diff" ? (
              <DiffView
                diff={detail.diff}
                tooLarge={detail.diffTooLarge}
                url={pr.url}
              />
            ) : (
              <CommentsView
                issueComments={detail.issueComments}
                reviewThreads={detail.reviewThreads}
                url={pr.url}
              />
            ))}
        </div>
      </div>
    </>
  );
}
