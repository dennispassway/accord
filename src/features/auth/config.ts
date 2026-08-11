export const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID ?? "";

export function isClientIdConfigured(
  clientId: string | null | undefined,
): boolean {
  return clientId != null && clientId !== "";
}
