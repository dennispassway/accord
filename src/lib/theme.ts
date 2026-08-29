export type Theme = "light" | "dark" | "system";
export const THEMES: readonly Theme[] = ["light", "dark", "system"];

let media: MediaQueryList | null = null;
let mediaListener: (() => void) | null = null;

function stopFollowingSystem(): void {
  if (media != null && mediaListener != null) {
    media.removeEventListener("change", mediaListener);
  }
  media = null;
  mediaListener = null;
}

/** Zet [data-theme] op <html>. Bij "light"/"dark" hard, bij "system" volgt
 * het de actuele prefers-color-scheme met een live matchMedia-listener; die
 * listener wordt opgeruimd zodra een hard thema gekozen wordt. */
export function applyTheme(theme: Theme): void {
  stopFollowingSystem();
  if (theme !== "system") {
    document.documentElement.dataset.theme = theme;
    return;
  }
  media = window.matchMedia("(prefers-color-scheme: dark)");
  const update = () => {
    document.documentElement.dataset.theme = media?.matches ? "dark" : "light";
  };
  update();
  mediaListener = update;
  media.addEventListener("change", mediaListener);
}
