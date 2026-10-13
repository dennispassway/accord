import { useEffect, useRef, useState } from "react";
import type { DiffSide } from "../../lib/github/prDetail";
import type { DraftThread } from "../../lib/github/review";
import { mod, modKey } from "../../lib/platform";
import { errorMessage } from "../update/updateState";
import { CommentBody } from "./commentMarkdown";
import "./inspector.css";
import type { DraftInput, ReviewDraft } from "./reviewDrafts";

/** Wat DiffView nodig heeft om opmerkingen in een review te verzamelen. */
export interface DraftActions {
  drafts: readonly ReviewDraft[];
  onAdd: (input: DraftInput) => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
  /** Eén opmerking direct versturen; gooit bij een fout. */
  onSendLoose: (thread: DraftThread) => Promise<void>;
}

const SIDE_LABEL: Record<DiffSide, string> = { LEFT: "oud", RIGHT: "nieuw" };

/** Cmd/Ctrl+Enter bevestigt, Esc sluit alleen dit veld: de inspector luistert
 * op window-niveau naar Esc (Cockpit.tsx), dus stopPropagation voorkomt dat
 * hij ook sluit. */
function fieldKeys(
  event: React.KeyboardEvent,
  confirm: () => void,
  close: () => void,
) {
  if (modKey(event) && event.key === "Enter") {
    event.preventDefault();
    confirm();
  } else if (event.key === "Escape") {
    event.stopPropagation();
    close();
  }
}

interface ComposerProps {
  line: number;
  side: DiffSide;
  showSide: boolean;
  onAdd: (body: string) => void;
  onSendLoose: (body: string) => Promise<void>;
  onClose: () => void;
}

/** Opstelveld onder een regel. Het ontstaat pas na een klik op de +, dus de
 * focus bij mount is gevraagd en pakt nooit een rij die al stond. */
export function DraftComposer({
  line,
  side,
  showSide,
  onAdd,
  onSendLoose,
  onClose,
}: ComposerProps) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // Het antwoord van een los verstuurde opmerking kan landen nadat het veld
  // weg is (weergavewissel, bestand ingeklapt): dan geen state meer zetten.
  // Een test vangt dit hier niet (geen jsdom).
  const mounted = useRef(true);
  const empty = text.trim() === "";

  useEffect(() => {
    mounted.current = true;
    textareaRef.current?.focus();
    return () => {
      mounted.current = false;
    };
  }, []);

  function add() {
    if (empty || busy) return;
    onAdd(text.trim());
    onClose();
  }

  async function sendLoose() {
    if (empty || busy) return;
    setBusy(true);
    setError(null);
    try {
      await onSendLoose(text.trim());
    } catch (failure) {
      if (mounted.current) {
        setError(errorMessage(failure));
        setBusy(false);
      }
      return;
    }
    if (mounted.current) onClose();
  }

  return (
    <div className="inspector-composer">
      <div className="inspector-composer-head">
        Opmerking op regel {line}
        {showSide && (
          <span className="inspector-thread-side">{SIDE_LABEL[side]}</span>
        )}
      </div>
      <textarea
        className="inspector-thread-textarea"
        ref={textareaRef}
        value={text}
        disabled={busy}
        placeholder="Schrijf een opmerking…"
        aria-label={`Opmerking op regel ${line}`}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => fieldKeys(event, add, onClose)}
      />
      <div className="inspector-composer-actions">
        <button
          type="button"
          className="inspector-thread-action"
          disabled={busy}
          onClick={onClose}
        >
          Annuleren
        </button>
        <button
          type="button"
          className="inspector-thread-action"
          disabled={busy || empty}
          onClick={() => void sendLoose()}
        >
          {busy ? "Versturen…" : "Los versturen"}
        </button>
        <button
          type="button"
          className="inspector-github-button inspector-composer-primary"
          disabled={busy || empty}
          onClick={add}
        >
          Aan review toevoegen
          <span className="inspector-composer-kbd mono">{mod("⏎")}</span>
        </button>
      </div>
      {error != null && <p className="inspector-thread-error">{error}</p>}
    </div>
  );
}

/** Een concept onder zijn regel: bewerkbaar en te verwijderen. */
export function DraftItem({
  draft,
  showSide,
  onEdit,
  onRemove,
}: {
  draft: ReviewDraft;
  showSide: boolean;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditing] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const focusOnEdit = useRef(false);

  useEffect(() => {
    if (editing !== null && focusOnEdit.current) {
      focusOnEdit.current = false;
      textareaRef.current?.focus();
    }
  }, [editing]);

  function save() {
    if (editing === null || editing.trim() === "") return;
    onEdit(draft.id, editing.trim());
    setEditing(null);
  }

  return (
    <div className="inspector-thread inspector-draft">
      <div className="inspector-thread-head">
        <span className="inspector-draft-label">in review</span>
        {showSide && (
          <span className="inspector-thread-side">
            {SIDE_LABEL[draft.side]}
          </span>
        )}
      </div>
      {editing === null ? (
        <>
          <div className="inspector-comment-text">
            <CommentBody>{draft.body}</CommentBody>
          </div>
          <div className="inspector-thread-actions">
            <button
              type="button"
              className="inspector-thread-action"
              onClick={() => {
                focusOnEdit.current = true;
                setEditing(draft.body);
              }}
            >
              Bewerken
            </button>
            <button
              type="button"
              className="inspector-thread-action"
              onClick={() => onRemove(draft.id)}
            >
              Verwijderen
            </button>
          </div>
        </>
      ) : (
        <div className="inspector-thread-reply">
          <textarea
            className="inspector-thread-textarea"
            ref={textareaRef}
            value={editing}
            aria-label="Opmerking bewerken"
            onChange={(event) => setEditing(event.target.value)}
            onKeyDown={(event) =>
              fieldKeys(event, save, () => setEditing(null))
            }
          />
          <div className="inspector-composer-actions">
            <button
              type="button"
              className="inspector-thread-action"
              onClick={() => setEditing(null)}
            >
              Annuleren
            </button>
            <button
              type="button"
              className="inspector-github-button"
              disabled={editing.trim() === ""}
              onClick={save}
            >
              Opslaan
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
