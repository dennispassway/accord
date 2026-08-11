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

function classifyLine(line: string): DiffLine["kind"] {
  if (
    line.startsWith("+++") ||
    line.startsWith("---") ||
    line.startsWith("index ") ||
    line.startsWith("new file") ||
    line.startsWith("deleted file") ||
    line.startsWith("similarity") ||
    line.startsWith("rename") ||
    line.startsWith("Binary files")
  ) {
    return "meta";
  }
  if (line.startsWith("@@")) return "hunk";
  if (line.startsWith("+")) return "add";
  if (line.startsWith("-")) return "del";
  return "context";
}

export function parseDiff(diff: string): DiffFile[] {
  if (!diff.trim()) return [];

  const files: DiffFile[] = [];
  let current: DiffFile | null = null;

  // Een trailing newline geeft een lege laatste regel bij split(); dat is
  // geen content-regel.
  const rawLines = diff.split("\n");
  if (rawLines[rawLines.length - 1] === "") rawLines.pop();

  for (const line of rawLines) {
    const diffGitMatch = line.match(/^diff --git a\/(.*) b\/(.*)$/);
    if (diffGitMatch) {
      // b-pad; bij een delete staat hetzelfde pad ook als a-pad in deze kop.
      const [, aPath, bPath] = diffGitMatch;
      current = { path: bPath || aPath || "", lines: [] };
      files.push(current);
      continue;
    }
    if (!current) continue;
    current.lines.push({ kind: classifyLine(line), text: line });
  }

  return files;
}
