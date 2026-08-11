import { useEffect } from "react";
import { mod } from "../../lib/platform";
import { CheckIcon } from "./icons";
import { useRovingMenu } from "./menuNav";
import type { SortMode } from "./sort";
import "./sortmenu.css";

const SORT_OPTIONS: { mode: SortMode; label: string; kbd: string }[] = [
  { mode: "triage", label: "Triage (wat nu te doen)", kbd: mod("1") },
  { mode: "prioriteit", label: "Prioriteit (P1 eerst)", kbd: mod("2") },
  { mode: "bijgewerkt", label: "Laatst bijgewerkt", kbd: mod("3") },
  { mode: "oudste", label: "Aanmaakdatum (oudste eerst)", kbd: mod("4") },
  { mode: "omvang", label: "Snelste eerst (kleinste diff)", kbd: mod("5") },
  { mode: "project", label: "Per project gegroepeerd", kbd: mod("6") },
];

interface SortMenuProps {
  activeMode: SortMode;
  onSelect: (mode: SortMode) => void;
  onClose: () => void;
}

/**
 * Popover van 224px bij de sorteerknop: vinkje bij de actieve modus,
 * ⌘1-⌘6 als hint. Sluit op Escape of een klik buiten het menu (een
 * fixed overlay onder het menu, zoals het design-script, voorkomt dat een
 * klik op de sorteerknop zelf het menu meteen weer heropent).
 */
export function SortMenu({ activeMode, onSelect, onClose }: SortMenuProps) {
  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const activeIndex = SORT_OPTIONS.findIndex(
    (option) => option.mode === activeMode,
  );
  const { setItemRef, handleKeyDown, tabIndexFor } = useRovingMenu(
    SORT_OPTIONS.length,
    Math.max(activeIndex, 0),
  );

  return (
    <>
      <button
        type="button"
        className="sort-menu-overlay"
        aria-label="Sluit sorteermenu"
        onClick={onClose}
      />
      <div className="sort-menu" role="menu" onKeyDown={handleKeyDown}>
        {SORT_OPTIONS.map((option, index) => (
          <button
            key={option.mode}
            type="button"
            role="menuitem"
            ref={setItemRef(index)}
            tabIndex={tabIndexFor(index)}
            className="sort-menu-item"
            onClick={() => {
              onSelect(option.mode);
              onClose();
            }}
          >
            <span className="sort-menu-check">
              {option.mode === activeMode && <CheckIcon size={11} />}
            </span>
            <span className="sort-menu-label">{option.label}</span>
            <span className="sort-menu-kbd mono">{option.kbd}</span>
          </button>
        ))}
      </div>
    </>
  );
}
