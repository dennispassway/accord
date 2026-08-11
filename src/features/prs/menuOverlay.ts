/**
 * Generieke, DOM-gebaseerde check op openstaande popup-menu's die niet in
 * Cockpit-state zitten (het merge-methodemenu in MergeSection en het
 * agent-modusmenu in AgentButtons; beide buiten de bestandsgrens van deze
 * slice, dus geen state-lifting mogelijk via DetailPanel). Beide renderen
 * een klik-weg-overlay met dezelfde CSS-klasse (".detail-merge-menu-overlay",
 * hergebruikt uit MergeSection); zolang een toekomstig menu die klasse
 * hergebruikt, doet het hier automatisch mee. Nieuwe menu's met een andere
 * overlay-klasse: hier toevoegen aan de selector.
 */
const MENU_OVERLAY_SELECTOR = ".detail-merge-menu-overlay";

/** Kleinste stukje van `Document`/`Element` dat we nodig hebben; geen jsdom
 * nodig om dit puur te testen (er is geen DOM-testomgeving in dit project). */
export interface QueryRoot {
  querySelector(selector: string): unknown;
}

export function isAnyMenuOverlayOpen(root: QueryRoot): boolean {
  return root.querySelector(MENU_OVERLAY_SELECTOR) != null;
}
