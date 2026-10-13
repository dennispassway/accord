import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { ReviewEvent } from "../../lib/github/review";
import { modKey } from "../../lib/platform";
import "./detail.css";
import { CheckIcon } from "./icons";
import { isAnyMenuOverlayOpen } from "./menuOverlay";
import { keyOfPr } from "./PrList";
import { reviewBlockedReason, useReviewDrafts } from "./reviewDrafts";

export interface ReviewButtonsState {
  approveEnabled: boolean;
  requestChangesEnabled: boolean;
  commentEnabled: boolean;
  /** Waarom de knop uit staat los van `busy`; uit `reviewBlockedReason`. */
  requestChangesReason: string | null;
  commentReason: string | null;
}

/**
 * Pure beslissing welke reviewknoppen aan staan, uit `reviewBlockedReason`
 * (dezelfde regel als de verzending): goedkeuren mag zonder tekst, changes
 * vragen niet, reageren alleen met concepten. `busy` zet ze alle drie uit.
 */
export function reviewButtonsState(
  text: string,
  busy: boolean,
  draftCount: number,
): ReviewButtonsState {
  const requestChangesReason = reviewBlockedReason(
    "REQUEST_CHANGES",
    text,
    draftCount,
  );
  const commentReason = reviewBlockedReason("COMMENT", text, draftCount);
  return {
    approveEnabled: !busy,
    requestChangesEnabled: !busy && requestChangesReason === null,
    commentEnabled: !busy && commentReason === null,
    requestChangesReason,
    commentReason,
  };
}

interface ApproveShortcutEvent {
  key: string;
  metaKey: boolean;
  ctrlKey: boolean;
  altKey: boolean;
  shiftKey: boolean;
  repeat: boolean;
}

/**
 * Pure beslissing: is dit toetsindruk-object de A-sneltoets voor goedkeuren.
 * Een herhaalde toets (ingedrukt houden) en elke modifier tellen niet mee,
 * anders keurt Shift+A of het vasthouden van A per ongeluk (extra) goed.
 */
export function isApproveShortcut(event: ApproveShortcutEvent): boolean {
  if (event.repeat) return false;
  if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) {
    return false;
  }
  return event.key.toLowerCase() === "a";
}

interface ReviewActionsProps {
  pr: PullRequest;
  onSubmitReview: (
    pr: PullRequest,
    event: ReviewEvent,
    body: string,
  ) => Promise<void>;
  /** Uit als een sheet of menu open staat: dan mag A niet goedkeuren. */
  shortcutsEnabled: boolean;
}

/**
 * Reviewvlak in het detailpaneel: goedkeuren (A), changes vragen en
 * reageren. Verschijnt alleen als een review van de gebruiker gevraagd is en
 * de PR niet van hemzelf is (zie DetailPanel).
 */
export function ReviewActions({
  pr,
  onSubmitReview,
  shortcutsEnabled,
}: ReviewActionsProps) {
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const draftCount = useReviewDrafts(keyOfPr(pr)).length;
  const buttons = reviewButtonsState(body, busy, draftCount);
  /** Synchrone vlag naast `busy`: React rendert `busy` niet meteen, dus een
   * tweede submit binnen dezelfde tik zou anders vóór de re-render nog door
   * de `busy`-check heen glippen. */
  const submittingRef = useRef(false);

  const submit = useCallback(
    (event: ReviewEvent) => {
      if (busy || submittingRef.current) return;
      const enabled =
        event === "APPROVE"
          ? buttons.approveEnabled
          : event === "REQUEST_CHANGES"
            ? buttons.requestChangesEnabled
            : buttons.commentEnabled;
      if (!enabled) return;
      submittingRef.current = true;
      setBusy(true);
      setError(null);
      onSubmitReview(pr, event, body)
        .then(() => setBody(""))
        .catch((err: unknown) => setError((err as Error).message))
        .finally(() => {
          submittingRef.current = false;
          setBusy(false);
        });
    },
    [pr, body, busy, buttons, onSubmitReview],
  );

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!shortcutsEnabled) return;
      if (isAnyMenuOverlayOpen(document)) return;
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(event.target.tagName)
      ) {
        return;
      }
      if (!isApproveShortcut(event)) return;
      event.preventDefault();
      submit("APPROVE");
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [submit, shortcutsEnabled]);

  function handleTextareaKeyDown(
    event: ReactKeyboardEvent<HTMLTextAreaElement>,
  ) {
    if (modKey(event) && event.key === "Enter" && buttons.commentEnabled) {
      event.preventDefault();
      submit("COMMENT");
    }
  }

  return (
    <div className="detail-review">
      <textarea
        className="detail-review-textarea"
        value={body}
        onChange={(event) => setBody(event.target.value)}
        onKeyDown={handleTextareaKeyDown}
        placeholder="Reactie (optioneel bij goedkeuren)"
        disabled={busy}
      />
      <div className="detail-review-row">
        <button
          type="button"
          className="detail-review-button detail-review-button-primary"
          disabled={!buttons.approveEnabled}
          onClick={() => submit("APPROVE")}
        >
          <CheckIcon size={14} />
          Goedkeuren
          <span className="detail-review-kbd mono">A</span>
        </button>
        <button
          type="button"
          className="detail-review-button detail-review-button-secondary"
          disabled={!buttons.requestChangesEnabled}
          title={buttons.requestChangesReason ?? undefined}
          onClick={() => submit("REQUEST_CHANGES")}
        >
          Changes vragen
        </button>
        <button
          type="button"
          className="detail-review-button detail-review-button-tertiary"
          disabled={!buttons.commentEnabled}
          title={buttons.commentReason ?? undefined}
          onClick={() => submit("COMMENT")}
        >
          Reageren
        </button>
      </div>
      {draftCount > 0 && (
        <p className="detail-review-drafts">
          {draftCount === 1
            ? "1 opmerking in concept gaat mee"
            : `${draftCount} opmerkingen in concept gaan mee`}
        </p>
      )}
      {error != null && <p className="detail-review-error">{error}</p>}
    </div>
  );
}
