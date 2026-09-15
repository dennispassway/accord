import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { loadPanels, savePanels } from "./cockpitPrefs";
import type { PanelWidths } from "./panelLayout";
import { clampPanels, DEFAULT_PANELS, panelsAfterDrag } from "./panelLayout";

export interface PanelWidthControls {
  /** De breedtes zoals ze nu gelden, passend gemaakt op het huidige venster. */
  panels: PanelWidths;
  /** Tijdens het slepen; schrijft nog niets naar de opslag. */
  resize: (panel: keyof PanelWidths, value: number) => void;
  /** Bij loslaten of een toetsaanslag; dit is wat bewaard blijft. */
  commit: (panel: keyof PanelWidths, value: number) => void;
  reset: (panel: keyof PanelWidths) => void;
}

/**
 * Houdt de breedte van de twee zijpanelen bij.
 *
 * De vastgelegde keuze en de toegepaste breedte zijn bewust gescheiden: een
 * smaller venster knijpt de panelen tijdelijk, maar overschrijft de keuze
 * niet, zodat ze terugveren zodra het venster weer ruimte heeft.
 */
export function usePanelWidths(): PanelWidthControls {
  const [committed, setCommitted] = useState<PanelWidths>(loadPanels);
  const [draft, setDraft] = useState<PanelWidths | null>(null);
  const [windowWidth, setWindowWidth] = useState(() => window.innerWidth);

  useEffect(() => {
    function handleResize() {
      setWindowWidth(window.innerWidth);
    }
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  // Alleen een vastgelegde breedte gaat naar de opslag, niet elke muisbeweging.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    savePanels(committed);
  }, [committed]);

  const panels = useMemo(
    () => clampPanels(draft ?? committed, windowWidth),
    [draft, committed, windowWidth],
  );

  const resize = useCallback(
    (panel: keyof PanelWidths, value: number) => {
      setDraft((current) =>
        panelsAfterDrag(committed, current, panel, value, windowWidth),
      );
    },
    [committed, windowWidth],
  );

  const commit = useCallback(
    (panel: keyof PanelWidths, value: number) => {
      setDraft(null);
      setCommitted((current) =>
        panelsAfterDrag(current, null, panel, value, windowWidth),
      );
    },
    [windowWidth],
  );

  const reset = useCallback((panel: keyof PanelWidths) => {
    setDraft(null);
    setCommitted((current) => ({ ...current, [panel]: DEFAULT_PANELS[panel] }));
  }, []);

  return { panels, resize, commit, reset };
}
