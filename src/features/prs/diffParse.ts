/**
 * Parser voor een unified diff (GitHub REST, application/vnd.github.diff)
 * naar een lijst bestanden met per regel een kind, voor presentatie in de
 * inspector-overlay. Geen dependency: de GitHub-diffsyntax is stabiel genoeg
 * voor een handmatige regel-classificatie.
 */
export interface DiffLine {
  kind: "add" | "del" | "hunk" | "context" | "meta";
  text: string;
}

export interface DiffFile {
  path: string;
  lines: DiffLine[];
}

/** Vóór de eerste @@ van een bestand is alles kopregel; binnen een hunk
 * beslist alleen het eerste teken. Een verwijderde `-- x` of toegevoegde `++i`
 * begint namelijk met `---`/`+++` en is een gewone regel. */
export function classifyLine(line: string, inHunk: boolean): DiffLine["kind"] {
  if (line.startsWith("@@")) return "hunk";
  if (!inHunk) return "meta";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

const SIMPLE_ESCAPES: Record<string, number> = {
  '"': 0x22,
  "\\": 0x5c,
  t: 0x09,
  n: 0x0a,
  r: 0x0d,
  a: 0x07,
  b: 0x08,
  f: 0x0c,
  v: 0x0b,
};

/** Git quote paden met bijzondere tekens ("caf\303\251.txt"). Octale escapes
 * zijn UTF-8 bytes en geen tekens, dus eerst bytes verzamelen en dan decoderen. */
export function unquoteGitPath(token: string): string {
  const quoted =
    token.length >= 2 && token.startsWith('"') && token.endsWith('"');
  const encoder = new TextEncoder();
  const bytes: number[] = [];
  const chars = Array.from(quoted ? token.slice(1, -1) : token);
  for (let i = 0; i < chars.length; i++) {
    const ch = chars[i] ?? "";
    if (ch !== "\\") {
      bytes.push(...encoder.encode(ch));
      continue;
    }
    const octal = chars.slice(i + 1, i + 4).join("");
    if (/^[0-7]{3}$/.test(octal)) {
      bytes.push(Number.parseInt(octal, 8));
      i += 3;
      continue;
    }
    const simple = SIMPLE_ESCAPES[chars[i + 1] ?? ""];
    if (simple === undefined) {
      bytes.push(0x5c);
    } else {
      bytes.push(simple);
      i += 1;
    }
  }
  return new TextDecoder().decode(new Uint8Array(bytes));
}

// Elke kant is gequote ("a/x y") of kaal (a/x); groep 1/3 is de gequote vorm.
const DIFF_GIT_HEADER =
  /^diff --git (?:("(?:[^"\\]|\\.)*")|a\/(.*)) (?:("(?:[^"\\]|\\.)*")|b\/(.*))$/;

function headerPath(quoted: string | undefined, plain: string | undefined) {
  return quoted === undefined ? (plain ?? "") : unquoteGitPath(quoted).slice(2);
}

export function parseDiff(diff: string): DiffFile[] {
  if (!diff.trim()) return [];

  const files: DiffFile[] = [];
  let current: DiffFile | null = null;
  let inHunk = false;

  // Een trailing newline geeft een lege laatste regel bij split(); dat is
  // geen content-regel.
  const rawLines = diff.split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();

  for (const line of rawLines) {
    const header = line.match(DIFF_GIT_HEADER);
    if (header) {
      // b-pad; bij een delete staat hetzelfde pad ook als a-pad in deze kop.
      const aPath = headerPath(header[1], header[2]);
      const bPath = headerPath(header[3], header[4]);
      current = { path: bPath || aPath, lines: [] };
      files.push(current);
      inHunk = false;
      continue;
    }
    if (!current) continue;
    const kind = classifyLine(line, inHunk);
    if (kind === "hunk") inHunk = true;
    current.lines.push({ kind, text: line });
  }

  return files;
}
