import "./update.css";
import type { UpdateState } from "./updateState";

interface UpdateBannerProps {
  state: UpdateState;
  onInstall: () => void;
  onDismiss: () => void;
}

/** Een kaart rechtsonder, in dezelfde toon als de toast-stack maar met acties
 * en dus wél clickbaar. Blijft staan tot iemand kiest: een update is geen
 * melding die je mag missen, maar mag het werk ook niet blokkeren. */
export function UpdateBanner({
  state,
  onInstall,
  onDismiss,
}: UpdateBannerProps) {
  if (state.status === "idle") return null;

  const installing = state.status === "installing";

  return (
    <div className="update-card" role="status" aria-live="polite">
      <div className="update-head">
        <span className="update-dot" />
        <span className="update-title">
          {installing
            ? "Update wordt geïnstalleerd…"
            : `Versie ${state.version} is beschikbaar`}
        </span>
      </div>

      {!installing && state.notes !== "" && (
        <div className="update-notes">{state.notes}</div>
      )}

      {!installing && (
        <div className="update-actions">
          <button
            type="button"
            className="update-button update-button-primary"
            onClick={onInstall}
          >
            Update en herstart
          </button>
          <button type="button" className="update-button" onClick={onDismiss}>
            Later
          </button>
        </div>
      )}
    </div>
  );
}
