export function formatVersion(
  major: number,
  minor: number,
  patch: number,
): string {
  return `${major}.${minor}.${patch}`;
}
