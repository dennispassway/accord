import type { RefCallback } from "react";
import { useCallback, useState } from "react";

/**
 * Meet de binnenbreedte van een element. Nodig omdat de kolombreedtes van de
 * PR-lijst in JS worden uitgerekend: de lijstkolom kan smaller worden zonder
 * dat het venster verandert, zodra de gebruiker een zijpaneel versleept.
 *
 * Een ref-callback en geen useLayoutEffect met een ref-object: het element dat
 * we meten hoort bij een component die soms iets anders rendert (de lege
 * staat van de lijst). Een effect met een lege deps-array draait één keer, en
 * als het element op dat moment nog niet bestaat komt er nooit een observer.
 * React roept de callback aan zodra het element in de DOM komt, elke keer
 * opnieuw, en nog vóór de eerste paint.
 */
export function useContainerWidth<T extends HTMLElement>(): [
  RefCallback<T>,
  number,
] {
  const [width, setWidth] = useState(0);

  const ref = useCallback((element: T | null) => {
    if (element === null) return;

    setWidth(element.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry !== undefined) setWidth(entry.contentRect.width);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return [ref, width];
}
