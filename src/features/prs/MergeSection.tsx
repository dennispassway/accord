import type { KeyboardEvent as ReactKeyboardEvent } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { MergeMethod } from "../../lib/github/merge";
import { mergeReasons } from "../../lib/github/merge";
import type { PrStackInfo } from "../../lib/github/stacks";
import { modKey } from "../../lib/platform";
import "./detail.css";
import { CheckIcon, ChevronIcon, MergeIcon } from "./icons";
import { useRovingMenu } from "./menuNav";
import { isAnyMenuOverlayOpen } from "./menuOverlay";

const STORAGE_KEY = "pr-cockpit.mergeMethod";

const METHOD_LABEL: Record<MergeMethod, string> = {
  SQUASH: "Squash and merge",
  MERGE: "Merge commit",
};

const MENU_METHODS: MergeMethod[] = ["SQUASH", "MERGE"];

/** Onthouden merge-methode, ook bruikbaar buiten dit component (Cockpit's
 * contextmenu-merge gebruikt dezelfde onthouden methode). */
export function loadMethod(): MergeMethod {
  const stored = localStorage.getItem(STORAGE_KEY);
  return stored === "SQUASH" || stored === "MERGE" ? stored : "SQUASH";
}

function methodNote(pr: PullRequest, method: MergeMethod): string {
  if (method === "SQUASH") {
    const title = pr.title.length > 34 ? `${pr.title.slice(0, 34)}…` : pr.title;
    return `${title} (#${pr.number})`;
  }
  return `Merge pull request #${pr.number} from ${pr.headRef}`;
}

interface MergeSectionProps {
  pr: PullRequest;
  stackInfo: PrStackInfo | undefined;
  onMergePr: (pr: PullRequest, method: MergeMethod) => Promise<void>;
  /** Uit als een sheet of menu open staat: dan mogen M/⌘⏎ niet mergen. */
  shortcutsEnabled: boolean;
}

/**
 * Primair merge-vlak zonder bevestigingsstap: M of ⌘⏎ merget direct met de
 * onthouden methode (localStorage). Kan de PR niet gemerged worden, dan een
 * omlijnd niet-klikbaar vlak met de redenen eronder.
 */
export function MergeSection({
  pr,
  stackInfo,
  onMergePr,
  shortcutsEnabled,
}: MergeSectionProps) {
  const [method, setMethod] = useState<MergeMethod>(loadMethod);
  const [menuOpen, setMenuOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const chevronRef = useRef<HTMLButtonElement>(null);
  const {
    setItemRef,
    handleKeyDown: handleMenuKeyDown,
    tabIndexFor,
  } = useRovingMenu(
    MENU_METHODS.length,
    Math.max(MENU_METHODS.indexOf(method), 0),
    menuOpen,
  );

  const reasons = mergeReasons(pr, stackInfo);
  const canMerge = reasons.length === 0;

  const merge = useCallback(() => {
    if (!canMerge || busy) return;
    setBusy(true);
    setError(null);
    onMergePr(pr, method)
      .catch((err: unknown) => setError((err as Error).message))
      .finally(() => setBusy(false));
  }, [pr, method, busy, canMerge, onMergePr]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (!shortcutsEnabled) return;
      // B5: het eigen methodemenu (menuOpen) of het agent-modusmenu in
      // AgentButtons staat open; beide renderen dezelfde overlay-klasse, dus
      // deze live DOM-check (i.p.v. alleen `menuOpen`) dekt ook dat laatste
      // menu, dat vanuit hier niet als state bereikbaar is.
      if (isAnyMenuOverlayOpen(document)) return;
      if (
        event.target instanceof HTMLElement &&
        ["INPUT", "TEXTAREA"].includes(event.target.tagName)
      ) {
        return;
      }
      const isShortcut =
        (event.key.toLowerCase() === "m" && !event.metaKey && !event.ctrlKey) ||
        (modKey(event) && event.key === "Enter");
      if (!isShortcut) return;
      event.preventDefault();
      merge();
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [merge, shortcutsEnabled]);

  function closeMenu() {
    setMenuOpen(false);
    chevronRef.current?.focus();
  }

  function chooseMethod(next: MergeMethod) {
    setMethod(next);
    localStorage.setItem(STORAGE_KEY, next);
    closeMenu();
  }

  function handleMenuAreaKeyDown(event: ReactKeyboardEvent<HTMLDivElement>) {
    if (event.key === "Escape") {
      event.preventDefault();
      closeMenu();
      return;
    }
    handleMenuKeyDown(event);
  }

  return (
    <div className="detail-merge">
      {canMerge ? (
        <div className="detail-merge-row">
          <button
            type="button"
            className="detail-merge-button"
            disabled={busy}
            onClick={merge}
          >
            <MergeIcon size={14} />
            {METHOD_LABEL[method]}
            <span className="detail-merge-kbd mono">M</span>
          </button>
          <button
            type="button"
            ref={chevronRef}
            className="detail-merge-chevron"
            title="Merge-methode kiezen"
            onClick={() => setMenuOpen((open) => !open)}
          >
            <ChevronIcon className="detail-merge-chevron-icon" />
          </button>
          {menuOpen && (
            <>
              <button
                type="button"
                className="detail-merge-menu-overlay"
                aria-label="Sluit menu"
                onClick={closeMenu}
              />
              <div
                className="detail-merge-menu"
                role="menu"
                onKeyDown={handleMenuAreaKeyDown}
              >
                {MENU_METHODS.map((option, index) => (
                  <button
                    key={option}
                    type="button"
                    role="menuitem"
                    ref={setItemRef(index)}
                    tabIndex={tabIndexFor(index)}
                    className="detail-merge-menu-item"
                    onClick={() => chooseMethod(option)}
                  >
                    <span className="detail-merge-menu-check">
                      {method === option && <CheckIcon size={11} />}
                    </span>
                    <span className="detail-merge-menu-body">
                      <span className="detail-merge-menu-label">
                        {METHOD_LABEL[option]}
                      </span>
                      <span className="detail-merge-menu-note mono">
                        {methodNote(pr, option)}
                      </span>
                    </span>
                  </button>
                ))}
                <div className="detail-merge-menu-footer">
                  Wordt onthouden voor volgende merges
                </div>
              </div>
            </>
          )}
        </div>
      ) : (
        <div className="detail-merge-blocked">
          <div className="detail-merge-blocked-bar" title={reasons.join(" · ")}>
            <MergeIcon size={14} />
            Merge
          </div>
          <ul className="detail-merge-reasons">
            {reasons.map((reason) => (
              <li key={reason}>{reason}</li>
            ))}
          </ul>
        </div>
      )}
      {error != null && <p className="detail-merge-error">{error}</p>}
    </div>
  );
}
