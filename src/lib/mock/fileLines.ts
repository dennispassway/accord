import { buildUnifiedItems } from "../../features/prs/diffModel";
import { parseDiff } from "../../features/prs/diffParse";

const MIN_LINES = 40;
const TAIL = 10;

/** De nieuwe kant van `path` in de diff, per regelnummer: de bron voor de
 * synthetische bestandsinhoud in de mockmodus. */
export function newSideLines(diff: string, path: string): Map<number, string> {
  const file = parseDiff(diff).find((f) => f.path === path);
  const lines = new Map<number, string>();
  for (const item of buildUnifiedItems(file?.lines ?? [])) {
    if (item.kind === "row" && item.newNo != null) {
      lines.set(item.newNo, item.text);
    }
  }
  return lines;
}

/** Mockmodus-bestand: de nieuwe kant van de diff op zijn regelnummer, de rest als `// regel N`. */
export function mockFileLines(known: ReadonlyMap<number, string>): string[] {
  const last = Math.max(MIN_LINES, ...known.keys());
  const length = last > MIN_LINES ? last + TAIL : MIN_LINES;
  return Array.from(
    { length },
    (_, i) => known.get(i + 1) ?? `// regel ${i + 1}`,
  );
}
