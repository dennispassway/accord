import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import type { DiffSide } from "../../lib/github/prDetail";
import type { DraftThread } from "../../lib/github/review";
import { mod, modKey } from "../../lib/platform";
import { CommentBody } from "./commentMarkdown";
import "./inspector.css";
import type { ReviewDraft } from "./reviewDrafts";

/** Wat DiffView nodig heeft om opmerkingen in een review te verzamelen. */
export interface DraftActions {
  drafts: readonly ReviewDraft[];
  onAdd: (input: DraftThread) => void;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
  /** Eén opmerking direct versturen; gooit bij een fout. */
  onSendLoose: (thread: DraftThread) => Promise<void>;
}

export const SIDE_LABEL: Record<DiffSide, string> = {
  LEFT: "oud",
  RIGHT: "nieuw",
};

/** Cmd/Ctrl+Enter bevestigt, Esc sluit alleen dit veld: de inspector luistert
 * op window-niveau naar Esc (Cockpit.tsx), dus stopPropagation voorkomt dat
 * hij ook sluit. */
function fieldKeys(
  event: KeyboardEvent,
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
  fileName: string;
  /** Verzendstatus van Los versturen, bewaard door de eigenaar: een remount
   * tijdens het versturen toont het veld dan nog als bezig, en een antwoord
   * dat na het unmounten landt zet zijn state op de eigenaar, niet op een
   * weggehaald exemplaar. Een test vangt dit hier niet (geen jsdom). */
  busy: boolean;
  error: string | null;
  /** Tekst die de eigenaar bewaart, zodat het veld een remount overleeft
   * (weergavewissel: de rij-key verschilt tussen unified en split). */
  initialText: string;
  onTextChange: (text: string) => void;
  onAdd: (body: string) => void;
  onSendLoose: (body: string) => void;
  onClose: () => void;
}

/** Opstelveld onder een regel. Het ontstaat pas na een klik op de +, dus de
 * focus bij mount is gevraagd en pakt nooit een rij die al stond. */
export function DraftComposer({
  line,
  side,
  showSide,
  fileName,
  busy,
  error,
  initialText,
  onTextChange,
  onAdd,
  onSendLoose,
  onClose,
}: ComposerProps) {
  const [text, setText] = useState(initialText);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const empty = text.trim() === "";

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  function add() {
    if (empty || busy) return;
    onAdd(text.trim());
    onClose();
  }

  function sendLoose() {
    if (empty || busy) return;
    onSendLoose(text.trim());
  }

  function close() {
    if (!busy) onClose();
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
        aria-label={`Opmerking op ${fileName} regel ${line} (${SIDE_LABEL[side]})`}
        onChange={(event) => {
          setText(event.target.value);
          onTextChange(event.target.value);
        }}
        onKeyDown={(event) => fieldKeys(event, add, close)}
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
          onClick={sendLoose}
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
  edits,
  onEdit,
  onRemove,
}: {
  draft: ReviewDraft;
  showSide: boolean;
  /** Lopende bewerkingen per concept-id, bij de eigenaar: de rij-key verschilt
   * tussen unified en split, dus dit item remount bij een weergavewissel. */
  edits: Map<string, string>;
  onEdit: (id: string, body: string) => void;
  onRemove: (id: string) => void;
}) {
  const [editing, setEditingState] = useState<string | null>(
    () => edits.get(draft.id) ?? null,
  );
  function setEditing(text: string | null) {
    if (text === null) edits.delete(draft.id);
    else edits.set(draft.id, text);
    setEditingState(text);
  }
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
