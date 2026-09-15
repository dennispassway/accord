import { useCallback, useEffect, useRef, useState } from "react";
import { loadColumns, saveColumns } from "./cockpitPrefs";
import type { ColumnKey, ColumnWidths } from "./columnLayout";
import { clampColumn, DEFAULT_COLUMNS } from "./columnLayout";

export interface ColumnWidthControls {
  columns: ColumnWidths;
  /** Tijdens het slepen; schrijft nog niets naar de opslag. */
  resize: (column: ColumnKey, value: number) => void;
  /** Bij loslaten of een toetsaanslag; dit is wat bewaard blijft. */
  commit: (column: ColumnKey, value: number) => void;
  reset: (column: ColumnKey) => void;
}

/**
 * Houdt de versleepte kolombreedtes bij. Dezelfde opzet als usePanelWidths:
 * alleen een vastgelegde breedte gaat naar de opslag, niet elke muisbeweging.
 *
 * Het passend maken op de werkelijke lijstbreedte gebeurt niet hier maar in
 * effectiveColumns, zodat een brede keuze bewaard blijft terwijl de lijst
 * tijdelijk smal is.
 */
export function useColumnWidths(): ColumnWidthControls {
  const [committed, setCommitted] = useState<ColumnWidths>(loadColumns);
  const [draft, setDraft] = useState<ColumnWidths | null>(null);

  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    saveColumns(committed);
  }, [committed]);

  const resize = useCallback(
    (column: ColumnKey, value: number) => {
      setDraft((current) => ({
        ...(current ?? committed),
        [column]: clampColumn(column, value),
      }));
    },
    [committed],
  );

  const commit = useCallback((column: ColumnKey, value: number) => {
    setDraft(null);
    setCommitted((current) => ({
      ...current,
      [column]: clampColumn(column, value),
    }));
  }, []);

  const reset = useCallback((column: ColumnKey) => {
    setDraft(null);
    setCommitted((current) => ({
      ...current,
      [column]: DEFAULT_COLUMNS[column],
    }));
  }, []);

  return { columns: draft ?? committed, resize, commit, reset };
}
