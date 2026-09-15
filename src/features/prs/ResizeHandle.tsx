import type { KeyboardEvent, PointerEvent } from "react";
import { useRef, useState } from "react";
import "./resizehandle.css";

const STEP = 8;
const STEP_LARGE = 32;

interface ResizeHandleProps {
  /** Voorleesnaam van de scheiding, bijvoorbeeld "Breedte van de zijbalk". */
  label: string;
  /**
   * 1 als naar rechts slepen het paneel breder maakt (zijbalk), -1 als naar
   * links slepen dat doet (detailpaneel aan de rechterrand).
   */
  direction: 1 | -1;
  width: number;
  min: number;
  max: number;
  /** Tijdens het slepen, per muisbeweging. De aanroeper clampt zelf. */
  onResize: (next: number) => void;
  /** Bij loslaten of een toetsaanslag: het moment om op te slaan. */
  onCommit: (next: number) => void;
  /** Dubbelklik: terug naar de standaardbreedte. */
  onReset: () => void;
  /**
   * "panel" ligt als nulbrede flexitem tussen twee panelen, "column" ligt
   * absoluut op de rechterrand van een kopcel in de lijst.
   */
  variant?: "panel" | "column";
}

/**
 * Sleepgreep tussen twee panelen. Ligt als een strook van 9px over de rand
 * zonder ruimte in de flexregel in te nemen, zodat de panelen zelf hun volle
 * breedte houden.
 */
export function ResizeHandle({
  label,
  direction,
  width,
  min,
  max,
  onResize,
  onCommit,
  onReset,
  variant = "panel",
}: ResizeHandleProps) {
  const start = useRef<{ x: number; width: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function widthAt(clientX: number): number {
    const from = start.current;
    if (from === null) return width;
    return from.width + (clientX - from.x) * direction;
  }

  function handlePointerDown(event: PointerEvent<HTMLDivElement>) {
    // Zonder dit start de browser een tekstselectie over de hele lijst.
    event.preventDefault();
    start.current = { x: event.clientX, width };
    setDragging(true);
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function handlePointerMove(event: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return;
    onResize(widthAt(event.clientX));
  }

  function handlePointerUp(event: PointerEvent<HTMLDivElement>) {
    if (start.current === null) return;
    // De laatste waarde uit het event, niet uit de prop: die kan nog een
    // render achterlopen op de laatste pointermove.
    const next = widthAt(event.clientX);
    start.current = null;
    setDragging(false);
    // Bij pointercancel is de capture al vanzelf losgelaten en telt de pointer
    // niet meer als actief; releasePointerCapture gooit dan NotFoundError en
    // de onCommit hieronder zou niet meer draaien - de sleep raakt dan zoek.
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    onCommit(next);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.key !== "ArrowLeft" && event.key !== "ArrowRight") return;
    event.preventDefault();
    const step = event.shiftKey ? STEP_LARGE : STEP;
    const towards = event.key === "ArrowRight" ? 1 : -1;
    onCommit(width + step * towards * direction);
  }

  return (
    // biome-ignore lint/a11y/useSemanticElements: een focusbare separator is het ARIA-window-splitter-patroon; een button krijgt de globale knopstyling en het verkeerde voorleesgedrag
    <div
      className={`resize-handle resize-handle-${variant}${dragging ? " dragging" : ""}`}
      data-direction={direction}
      role="separator"
      aria-orientation="vertical"
      aria-label={label}
      aria-valuenow={Math.round(width)}
      aria-valuemin={min}
      aria-valuemax={max}
      tabIndex={0}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
      onDoubleClick={onReset}
      onKeyDown={handleKeyDown}
    />
  );
}
