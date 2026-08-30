import { getCurrentWindow } from "@tauri-apps/api/window";
import { useEffect, useState } from "react";
import { isMockApp, mockMode } from "./mock/mode";

const IS_MOCK = isMockApp(mockMode());

interface FocusTarget {
  addEventListener(type: string, listener: () => void): void;
  removeEventListener(type: string, listener: () => void): void;
}

interface FocusDocument extends FocusTarget {
  hasFocus(): boolean;
}

/**
 * Verbindt `setFocused` aan `document.hasFocus()`, herlezen bij elke
 * focus/blur/visibilitychange. Een tabwissel binnen hetzelfde browservenster
 * vuurt GEEN `window`-focus/blur (die reageren alleen op een OS-niveau
 * vensterwissel): dat vuurt wel `visibilitychange` en verandert
 * `document.hasFocus()`. Zonder die listener blijft `focused` na een
 * tabwissel voor altijd op de startwaarde hangen, en meldt
 * `decideNotification` nooit iets (de poort denkt dat het venster nog
 * gefocust is). Geeft een cleanup-functie terug die alle listeners weer
 * verwijdert.
 */
export function setupMockFocusTracking(
  win: FocusTarget,
  doc: FocusDocument,
  setFocused: (focused: boolean) => void,
): () => void {
  const update = () => setFocused(doc.hasFocus());
  update();
  win.addEventListener("focus", update);
  win.addEventListener("blur", update);
  doc.addEventListener("visibilitychange", update);
  return () => {
    win.removeEventListener("focus", update);
    win.removeEventListener("blur", update);
    doc.removeEventListener("visibilitychange", update);
  };
}

/**
 * Volgt of het venster gefocust is, de gate voor systeemnotificaties (alleen
 * melden als de gebruiker niet zit te kijken). Buiten Tauri (mockmodus/kale
 * browser) is er geen window-API, dus dan telt `document.hasFocus()` (zie
 * setupMockFocusTracking).
 */
export function useWindowFocused(): boolean {
  const [focused, setFocused] = useState(true);

  useEffect(() => {
    if (IS_MOCK) {
      return setupMockFocusTracking(window, document, setFocused);
    }
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void getCurrentWindow()
      .isFocused()
      .then((isFocused) => {
        if (!cancelled) setFocused(isFocused);
      });
    void getCurrentWindow()
      .onFocusChanged((event) => {
        if (!cancelled) setFocused(event.payload);
      })
      .then((fn) => {
        if (cancelled) {
          fn();
          return;
        }
        unlisten = fn;
      });
    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);

  return focused;
}
