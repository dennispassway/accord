import type { KeyboardEvent } from "react";
import { useEffect, useRef, useState } from "react";

/**
 * Volgende roving-focus-index bij ArrowDown (+1) of ArrowUp (-1), met
 * wraparound. Puur en zonder DOM, dus zonder jsdom testbaar.
 *
 * `disabled` is een optioneel masker (per index) van items die overgeslagen
 * moeten worden: een disabled button kan geen DOM-focus krijgen, dus focus
 * erop belanden liet een eerste ArrowDown eerder onzichtbaar niets doen.
 */
export function nextMenuIndex(
  current: number,
  delta: 1 | -1,
  length: number,
  disabled?: readonly boolean[],
): number {
  if (length === 0) return -1;
  let next = current;
  for (let i = 0; i < length; i++) {
    next = (next + delta + length) % length;
    if (!disabled?.[next]) return next;
  }
  // Alle items disabled: blijf staan waar je stond.
  return current;
}

/**
 * Roving-focus toetsenbordnavigatie voor de eigen HTML-menu's (contextmenu,
 * sortmenu, merge-methodemenu, agent-modusmenu): pijltjes verplaatsen de
 * DOM-focus door de items via tabIndex 0/-1. Enter/Space activeren het
 * gefocuste item via het native button-gedrag, en Escape sluit al via de
 * bestaande listeners in elk menu, dus die twee zitten hier bewust niet in.
 */
export function useRovingMenu(
  itemCount: number,
  initialIndex = 0,
  /** Voor menu's die niet zelf mounten/unmounten (MergeSection, AgentButtons:
   * hun menu is een conditionele render binnen een altijd gemount component)
   * moet de focus pas volgen zodra het menu écht open is, anders vuurt de
   * focus-effect bij het openen niet af omdat activeIndex niet wijzigt. */
  active = true,
  /** Per-index masker van disabled items (bv. "Merge" op een niet-mergebare
   * PR): pijltjes slaan die over in plaats van er focus op te proberen te
   * zetten. */
  disabled?: readonly boolean[],
) {
  const [activeIndex, setActiveIndex] = useState(() => {
    if (itemCount === 0) return 0;
    const start = Math.min(initialIndex, itemCount - 1);
    return disabled?.[start]
      ? nextMenuIndex(start, 1, itemCount, disabled)
      : start;
  });
  const itemRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!active) return;
    itemRefs.current[activeIndex]?.focus();
  }, [activeIndex, active]);

  function setItemRef(index: number) {
    return (el: HTMLButtonElement | null) => {
      itemRefs.current[index] = el;
    };
  }

  function handleKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (itemCount === 0) return;
    if (event.key === "ArrowDown") {
      event.preventDefault();
      setActiveIndex((i) => nextMenuIndex(i, 1, itemCount, disabled));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setActiveIndex((i) => nextMenuIndex(i, -1, itemCount, disabled));
    }
  }

  return {
    activeIndex,
    setItemRef,
    handleKeyDown,
    tabIndexFor: (index: number) => (index === activeIndex ? 0 : -1),
  };
}
