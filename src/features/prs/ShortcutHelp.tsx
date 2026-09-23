import { mod } from "../../lib/platform";
import "./shortcuthelp.css";

interface ShortcutEntry {
  keys: string;
  label: string;
}

const SHORTCUTS: ShortcutEntry[] = [
  { keys: "↑ ↓", label: "Navigeren door de lijst" },
  { keys: "R", label: "Review starten" },
  { keys: "D", label: "Diff en reacties bekijken" },
  { keys: "M", label: "Mergen" },
  { keys: "⏎", label: "Openen op GitHub" },
  { keys: "dubbelklik", label: "Diff en reacties bekijken" },
  { keys: mod("F"), label: "Zoeken" },
  { keys: mod("A"), label: "Alles selecteren" },
  { keys: `${mod("1")} … ${mod("5")}`, label: "Sorteren" },
  { keys: mod("R"), label: "Verversen" },
  { keys: "Esc", label: "Sluiten / zoekveld leegmaken" },
  { keys: "?", label: "Deze hulp" },
  { keys: "J / K", label: "Navigeren door de lijst (alternatief)" },
  { keys: "Shift + ↑ ↓", label: "Selectie uitbreiden" },
  { keys: "⌘-klik / Shift-klik", label: "Meerdere PR's selecteren" },
  { keys: "A", label: "Goedkeuren (als jouw review gevraagd is)" },
  { keys: "L", label: "Later: PR snoozen" },
  { keys: mod("⏎"), label: "Mergen" },
  { keys: mod(","), label: "Instellingen" },
  { keys: "1 / 2", label: "Diff of reacties (in de inspector)" },
];

interface ShortcutHelpProps {
  open: boolean;
  onClose: () => void;
}

/** U8: overlay met de beschikbare sneltoetsen, opent met `?` en sluit met
 * Escape (afgehandeld in Cockpit's bestaande Escape-volgorde) of een klik
 * op de achtergrond. */
export function ShortcutHelp({ open, onClose }: ShortcutHelpProps) {
  if (!open) return null;
  return (
    <>
      <button
        type="button"
        className="shortcut-help-overlay"
        aria-label="Sluit sneltoetsen-hulp"
        onClick={onClose}
      />
      <div
        className="shortcut-help"
        role="dialog"
        aria-modal="true"
        aria-label="Sneltoetsen"
      >
        <div className="shortcut-help-title">Sneltoetsen</div>
        <ul className="shortcut-help-list">
          {SHORTCUTS.map((entry) => (
            <li key={entry.keys}>
              <span className="shortcut-help-keys mono">{entry.keys}</span>
              <span>{entry.label}</span>
            </li>
          ))}
        </ul>
      </div>
    </>
  );
}
