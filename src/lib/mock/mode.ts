/**
 * Dev-only mockmodus voor visuele QA in een kale browser, zonder Tauri en
 * zonder GitHub. Actief via `?mock` (alias voor `?mock=app`) of
 * `?mock=login-client|login-uit|login-device|update`, en alleen in
 * `import.meta.env.DEV`.
 */
export type MockMode =
  | "off"
  | "app"
  | "login-client"
  | "login-uit"
  | "login-device"
  | "update";

const VALID_MODES: readonly MockMode[] = [
  "app",
  "login-client",
  "login-uit",
  "login-device",
  "update",
];

/** De cockpit draait met mockdata in elke modus die de app zelf toont, dus
 * ook in `update` (die verschilt alleen in het updatescherm). */
export function isMockApp(mode: MockMode): boolean {
  return mode === "app" || mode === "update";
}

export function mockMode(): MockMode {
  if (!import.meta.env.DEV) return "off";
  if (typeof window === "undefined" || typeof window.location === "undefined") {
    return "off";
  }
  const params = new URLSearchParams(window.location.search);
  if (!params.has("mock")) return "off";
  const value = params.get("mock");
  if (value == null || value === "") return "app";
  return (VALID_MODES as string[]).includes(value)
    ? (value as MockMode)
    : "app";
}
