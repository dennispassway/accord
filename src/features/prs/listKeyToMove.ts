/**
 * Vertaalt een toets uit de lijst-navigatie naar een verplaatsingsrichting.
 * J/K zijn het vim-achtige alternatief voor de pijltjes (U6); beide gelden
 * alleen zonder modifiers, dat toetst de aanroeper.
 */
export function listKeyToMove(key: string): 1 | -1 | null {
  if (key === "ArrowDown" || key === "j" || key === "J") return 1;
  if (key === "ArrowUp" || key === "k" || key === "K") return -1;
  return null;
}

/** Duck-typed subset van HTMLElement (zelfde patroon als
 * ApproveShortcutEvent in ReviewActions.tsx): dit project heeft geen jsdom,
 * dus een pure helper toetst op deze velden in plaats van op een echt
 * DOM-element. */
interface TypingTarget {
  tagName: string;
  isContentEditable: boolean;
}

/**
 * True als een toetsaanslag in een tekstinvoer landt (zoekveld, textarea of
 * contenteditable): de lijst-navigatie (J/K/pijltjes/Enter) mag daar niet in
 * grijpen. Zonder de textarea-tak verplaatste "kijk" typen in het
 * reactieveld (ReviewActions) de selectie en remountte het formulier, met
 * verlies van het concept als gevolg.
 */
export function isTypingTarget(target: TypingTarget | null): boolean {
  if (target == null) return false;
  if (target.tagName === "INPUT" || target.tagName === "TEXTAREA") return true;
  return target.isContentEditable;
}
