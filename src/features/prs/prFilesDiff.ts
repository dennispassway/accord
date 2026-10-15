import type { PrFile } from "../../lib/github/prFiles";
import { MODE_ONLY_LINE, NO_TEXT_DIFF_LINE, TOO_LARGE_LINE } from "./diffModel";
import { classifyLine, type DiffFile, type DiffLine } from "./diffParse";

const EMPTY_BLOB_SHA = "e69de29bb2d1d6434b8b29ae775ad8c2e48c5391";

const ESCAPES: Record<string, string> = {
  '"': '\\"',
  "\\": "\\\\",
  "\n": "\\n",
  "\t": "\\t",
  "\r": "\\r",
};

/** Het pad zoals git het in een kopregel schrijft: tussen quotes met escapes
 * zodra het `"`, `\` of een stuurteken bevat. `fileStatus` leest dat terug. */
function quoteGitPath(path: string): string {
  let special = false;
  let out = "";
  for (const ch of path) {
    const code = ch.charCodeAt(0);
    const escaped =
      ESCAPES[ch] ??
      (code < 0x20 || code === 0x7f
        ? `\\${code.toString(8).padStart(3, "0")}`
        : undefined);
    if (escaped === undefined) out += ch;
    else {
      special = true;
      out += escaped;
    }
  }
  return special ? `"${out}"` : path;
}

function patchLines(patch: string): DiffLine[] {
  const texts = patch.split("\n");
  if (texts[texts.length - 1] === "") texts.pop();
  // Een patch bevat alleen hunks: elke regel valt dus binnen een hunk.
  return texts.map((text) => ({ kind: classifyLine(text, true), text }));
}

const meta = (text: string): DiffLine => ({ kind: "meta", text });

function metaLines(file: PrFile): DiffLine[] {
  const lines: DiffLine[] = [];
  if (file.previous_filename !== undefined) {
    const verb = file.status === "copied" ? "copy" : "rename";
    lines.push(
      meta(`${verb} from ${quoteGitPath(file.previous_filename)}`),
      meta(`${verb} to ${quoteGitPath(file.filename)}`),
    );
  }
  if (file.patch !== undefined) return lines;
  // Zonder patch: te groot als er wel regels wijzigden. Anders een leeg,
  // hernoemd of rechten-bestand, en pas als dat het niet is een binair bestand.
  if (file.changes > 0) lines.push(meta(TOO_LARGE_LINE));
  else if (file.previous_filename === undefined) {
    if (file.status === "added" && file.sha === EMPTY_BLOB_SHA) {
      lines.push(meta("new file mode 100644"));
    } else if (file.status === "added" || file.status === "removed") {
      // Leeg en binair zijn hier niet te scheiden, behalve via de lege blob.
      lines.push(meta(NO_TEXT_DIFF_LINE));
    } else if (file.status === "changed") {
      lines.push(meta(MODE_ONLY_LINE));
    } else {
      lines.push(meta("Binary files differ"));
    }
  }
  return lines;
}

/** De bestanden uit /pulls/{n}/files als DiffFile's, zonder omweg langs
 * diff-tekst: het pad blijft letterlijk, ook met spaties, quotes of newlines. */
export function diffFilesFromPrFiles(files: readonly PrFile[]): DiffFile[] {
  return files.map((file) => ({
    path: file.filename,
    lines: [
      ...metaLines(file),
      ...(file.patch === undefined ? [] : patchLines(file.patch)),
    ],
  }));
}
