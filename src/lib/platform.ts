/**
 * Platformverschillen in de frontend: macOS gebruikt ⌘ als modifier en heeft
 * vibrancy achter het transparante venster; Linux/Windows gebruiken Ctrl en
 * krijgen een effen achtergrond (zie main.tsx en App.css).
 */
// In node-tests bestaat navigator niet: dan geldt de niet-mac-tak (Ctrl).
export const isMac = (globalThis.navigator?.userAgent ?? "").includes("Mac");

/** True als de platform-modifier (⌘ op macOS, Ctrl elders) is ingedrukt. */
export function modKey(event: { metaKey: boolean; ctrlKey: boolean }): boolean {
  return isMac ? event.metaKey : event.ctrlKey;
}

/** Sneltoets-label met de platform-modifier: mod("F") → "⌘F" of "Ctrl+F". */
export function mod(key: string): string {
  return isMac ? `⌘${key}` : `Ctrl+${key}`;
}
