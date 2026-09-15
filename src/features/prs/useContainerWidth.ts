import type { RefObject } from "react";
import { useLayoutEffect, useRef, useState } from "react";

/**
 * Meet de binnenbreedte van een element. Nodig omdat de kolombreedtes van de
 * PR-lijst in JS worden uitgerekend: de lijstkolom kan smaller worden zonder
 * dat het venster verandert, zodra de gebruiker een zijpaneel versleept.
 *
 * useLayoutEffect en niet useEffect: de eerste meting moet er zijn vóór de
 * eerste paint, anders knippert de rij één frame op de verkeerde breedte.
 */
export function useContainerWidth<T extends HTMLElement>(): [
  RefObject<T | null>,
  number,
] {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);

  useLayoutEffect(() => {
    const element = ref.current;
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
