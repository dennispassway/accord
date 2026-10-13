export interface Segment {
  text: string;
  changed: boolean;
}

/** Onder dit aandeel gedeelde tekens is de regel herschreven, geen aangepast. */
const MIN_SHARED = 0.3;

const tokenize = (s: string): string[] => s.match(/\w+|\s+|[^\w\s]/gu) ?? [];

function toSegments(
  tokens: string[],
  prefix: number,
  suffix: number,
): Segment[] {
  const parts: [string, boolean][] = [
    [tokens.slice(0, prefix).join(""), false],
    [tokens.slice(prefix, tokens.length - suffix).join(""), true],
    [tokens.slice(tokens.length - suffix).join(""), false],
  ];
  const out: Segment[] = [];
  for (const [text, changed] of parts) {
    if (text === "") continue;
    const last = out[out.length - 1];
    if (last?.changed === changed) last.text += text;
    else out.push({ text, changed });
  }
  return out;
}

const plain = (text: string): Segment[] =>
  text === "" ? [] : [{ text, changed: false }];

export function wordDiff(
  oldText: string,
  newText: string,
): { old: Segment[]; new: Segment[] } {
  const unchanged = { old: plain(oldText), new: plain(newText) };
  if (oldText === newText) return unchanged;

  const a = tokenize(oldText);
  const b = tokenize(newText);
  const max = Math.min(a.length, b.length);
  let prefix = 0;
  while (prefix < max && a[prefix] === b[prefix]) prefix++;
  let suffix = 0;
  while (
    suffix < max - prefix &&
    a[a.length - 1 - suffix] === b[b.length - 1 - suffix]
  ) {
    suffix++;
  }

  const shared =
    a.slice(0, prefix).join("").length +
    a.slice(a.length - suffix).join("").length;
  if (shared < MIN_SHARED * Math.max(oldText.length, newText.length)) {
    return unchanged;
  }
  return {
    old: toSegments(a, prefix, suffix),
    new: toSegments(b, prefix, suffix),
  };
}
