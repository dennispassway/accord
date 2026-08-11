export type LogoutClickState = "idle" | "confirming";

/**
 * Twee-staps-uitloggen: eerste klik (state "idle") wapent de bevestiging,
 * tweede klik (state "confirming") logt daadwerkelijk uit.
 */
export function nextLogoutClick(state: LogoutClickState): "confirm" | "logout" {
  return state === "confirming" ? "logout" : "confirm";
}
