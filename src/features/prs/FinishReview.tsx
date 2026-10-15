import { useEffect, useRef, useState } from "react";
import { type ReviewEvent, reviewBlockedReason } from "../../lib/github/review";
import { mod, modKey } from "../../lib/platform";
import { errorMessage } from "../update/updateState";
import "./inspector.css";
import type { ReviewDraft } from "./reviewDrafts";

const CHOICE_LABELS: Record<ReviewEvent, { label: string; hint?: string }> = {
  COMMENT: { label: "Reageren" },
  REQUEST_CHANGES: {
    label: "Changes vragen",
    hint: "Blokkeert mergen tot er een nieuwe review is",
  },
  APPROVE: { label: "Goedkeuren" },
};
const CHOICES = Object.keys(CHOICE_LABELS) as ReviewEvent[];

/** Een tweede klik op "Review weggooien" moet binnen dit venster vallen. */
const CONFIRM_MS = 4000;

function firstLine(body: string): string {
  return body.split("\n")[0] ?? "";
}

interface FinishReviewProps {
  drafts: readonly ReviewDraft[];
  /** Ids van concepten waarvan de regel niet in de diff staat. */
  outsideDiff: ReadonlySet<string>;
  /** Ids van concepten die op een eerdere commit geschreven zijn. */
  staleDrafts: ReadonlySet<string>;
  /** Op een eigen PR kan alleen gereageerd worden (reviewBlockedReason). */
  authoredByMe: boolean;
  onRemoveDraft: (id: string) => void;
  /** Wist alle concepten van deze PR. */
  onDiscard: () => void;
  /** Verstuurt de review met de concepten; gooit bij een fout. */
  onSubmit: (event: ReviewEvent, body: string) => Promise<void>;
  /** Na een geslaagde review, bv. de detail verversen. */
  onSubmitted: () => void;
}

/** Knop in de kop van de inspector plus het paneel waarmee de review wordt
 * afgerond. Staat in de inspector onder `key={prKey}`: een antwoord dat landt
 * nadat de gebruiker naar een andere PR ging, belandt op een weggehaald
 * exemplaar (async-antwoord-na-wissel.md). */
export function FinishReview({
  drafts,
  outsideDiff,
  staleDrafts,
  authoredByMe,
  onRemoveDraft,
  onDiscard,
  onSubmit,
  onSubmitted,
}: FinishReviewProps) {
  const [open, setOpen] = useState(false);
  const [event, setEvent] = useState<ReviewEvent>("COMMENT");
  const [body, setBody] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirmingDiscard, setConfirmingDiscard] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Synchrone vlag naast `busy`: twee Cmd+Enter in dezelfde tik mogen niet
  // allebei door de busy-check heen (zie ReviewActions).
  const submittingRef = useRef(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open) textareaRef.current?.focus();
  }, [open]);

  // De bevestiging valt vanzelf terug: een klik die uren later komt telt niet.
  useEffect(() => {
    if (!confirmingDiscard) return;
    const timer = setTimeout(() => setConfirmingDiscard(false), CONFIRM_MS);
    return () => clearTimeout(timer);
  }, [confirmingDiscard]);

  const reasonFor = (choice: ReviewEvent) =>
    reviewBlockedReason(choice, body, drafts.length, authoredByMe);
  const reason = reasonFor(event);
  const outsideCount = drafts.filter((d) => outsideDiff.has(d.id)).length;

  function close() {
    setOpen(false);
    buttonRef.current?.focus();
  }

  async function submit() {
    if (submittingRef.current || reason !== null) return;
    submittingRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onSubmit(event, body.trim());
    } catch (failure) {
      // Het paneel kan intussen dicht zijn (Esc): de fout moet dan zichtbaar
      // blijven, anders lijkt de review verstuurd.
      setError(errorMessage(failure));
      setOpen(true);
      return;
    } finally {
      submittingRef.current = false;
      setBusy(false);
    }
    if (!mounted.current) return;
    setBody("");
    setEvent("COMMENT");
    setOpen(false);
    onSubmitted();
  }

  function discard() {
    if (busy) return;
    if (!confirmingDiscard) {
      setConfirmingDiscard(true);
      return;
    }
    onDiscard();
    setConfirmingDiscard(false);
    setBody("");
    setError(null);
    close();
  }

  return (
    <div className="inspector-finish">
      <button
        ref={buttonRef}
        type="button"
        className="inspector-github-button"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        Review afronden
        {drafts.length > 0 && ` · ${drafts.length}`}
      </button>
      {open && (
        <div
          className="inspector-finish-panel"
          role="dialog"
          aria-label="Review afronden"
          onKeyDown={(keyEvent) => {
            if (keyEvent.key === "Escape") {
              // Alleen het paneel, niet de inspector: zie ThreadItem.
              keyEvent.stopPropagation();
              close();
            } else if (modKey(keyEvent) && keyEvent.key === "Enter") {
              keyEvent.preventDefault();
              void submit();
            }
          }}
        >
          {drafts.length > 0 ? (
            <ul className="inspector-finish-drafts">
              {drafts.map((draft) => (
                <li key={draft.id} className="inspector-finish-draft">
                  <div className="inspector-finish-draft-text">
                    <span className="inspector-finish-draft-where mono">
                      {draft.path}:{draft.line}
                    </span>
                    <span className="inspector-finish-draft-body">
                      {firstLine(draft.body)}
                    </span>
                    {outsideDiff.has(draft.id) && (
                      <span className="inspector-finish-draft-warn">
                        regel niet in deze diff
                      </span>
                    )}
                    {staleDrafts.has(draft.id) && (
                      <span className="inspector-finish-draft-warn">
                        geschreven op een eerdere commit
                      </span>
                    )}
                  </div>
                  <button
                    type="button"
                    className="inspector-thread-action"
                    aria-label={`Concept op ${draft.path}:${draft.line} verwijderen`}
                    disabled={busy}
                    onClick={() => onRemoveDraft(draft.id)}
                  >
                    Verwijderen
                  </button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="inspector-finish-empty">
              Nog geen opmerkingen op regels. Gebruik de + in de diff.
            </p>
          )}
          <textarea
            ref={textareaRef}
            className="inspector-thread-textarea"
            value={body}
            disabled={busy}
            aria-label="Samenvatting"
            placeholder="Samenvatting van je review"
            onChange={(changeEvent) => setBody(changeEvent.target.value)}
          />
          <fieldset className="inspector-finish-choices" disabled={busy}>
            <legend className="inspector-finish-legend">Soort review</legend>
            {CHOICES.map((choice) => {
              // Een keuze die op een eigen PR niet mag blijft zichtbaar met
              // haar reden; de tekstregel is geen blokkade van de keuze zelf.
              const blockedByAuthor =
                authoredByMe && choice !== "COMMENT" ? reasonFor(choice) : null;
              const { label, hint } = CHOICE_LABELS[choice];
              return (
                <label key={choice} className="inspector-finish-choice">
                  <input
                    type="radio"
                    name="review-event"
                    checked={event === choice}
                    disabled={blockedByAuthor !== null}
                    onChange={() => setEvent(choice)}
                  />
                  <span>
                    {label}
                    {(blockedByAuthor ?? hint) && (
                      <span className="inspector-finish-hint">
                        {blockedByAuthor ?? hint}
                      </span>
                    )}
                  </span>
                </label>
              );
            })}
          </fieldset>
          {outsideCount > 0 && (
            <p className="inspector-finish-warn">
              {outsideCount === 1
                ? "1 opmerking staat niet in de diff"
                : `${outsideCount} opmerkingen staan niet in de diff`}
              : GitHub kan ze weigeren, en dan wordt de hele review niet
              geplaatst.
            </p>
          )}
          {reason !== null && <p className="inspector-finish-hint">{reason}</p>}
          {error != null && (
            <p className="inspector-thread-error" role="alert">
              {error}
            </p>
          )}
          <div className="inspector-finish-actions">
            <button
              type="button"
              className="inspector-thread-action"
              disabled={busy || (drafts.length === 0 && body.trim() === "")}
              onClick={discard}
              onBlur={() => setConfirmingDiscard(false)}
            >
              {confirmingDiscard
                ? `Weet je het zeker · ${drafts.length === 1 ? "1 opmerking" : `${drafts.length} opmerkingen`}`
                : "Review weggooien"}
            </button>
            <button
              type="button"
              className="inspector-github-button inspector-composer-primary"
              disabled={busy || reason !== null}
              onClick={() => void submit()}
            >
              {busy ? "Versturen…" : "Versturen"}
              <span className="inspector-composer-kbd mono">{mod("⏎")}</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
