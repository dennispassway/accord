const MIN_LINES = 40;
const TAIL = 10;

/** Mockmodus-bestand: de nieuwe kant van de diff op zijn regelnummer, de rest als `// regel N`. */
export function mockFileLines(known: ReadonlyMap<number, string>): string[] {
  const last = Math.max(MIN_LINES, ...known.keys(), 0);
  const length = last > MIN_LINES ? last + TAIL : MIN_LINES;
  return Array.from(
    { length },
    (_, i) => known.get(i + 1) ?? `// regel ${i + 1}`,
  );
}
