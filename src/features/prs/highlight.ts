import hljs from "highlight.js/lib/core";
import bash from "highlight.js/lib/languages/bash";
import css from "highlight.js/lib/languages/css";
import go from "highlight.js/lib/languages/go";
import javascript from "highlight.js/lib/languages/javascript";
import json from "highlight.js/lib/languages/json";
import markdown from "highlight.js/lib/languages/markdown";
import php from "highlight.js/lib/languages/php";
import python from "highlight.js/lib/languages/python";
import rust from "highlight.js/lib/languages/rust";
import sql from "highlight.js/lib/languages/sql";
import typescript from "highlight.js/lib/languages/typescript";
import xml from "highlight.js/lib/languages/xml";
import yaml from "highlight.js/lib/languages/yaml";
import "./highlight.css";
import type { Segment } from "./wordDiff";

export interface HighlightRow {
  type: "add" | "del" | "context";
  text: string;
}

const LANGUAGES = {
  typescript,
  javascript,
  json,
  css,
  xml,
  rust,
  yaml,
  markdown,
  bash,
  python,
  sql,
  php,
  go,
};
for (const [name, def] of Object.entries(LANGUAGES)) {
  hljs.registerLanguage(name, def);
}

const EXTENSIONS: Record<string, keyof typeof LANGUAGES> = {
  ts: "typescript",
  tsx: "typescript",
  mts: "typescript",
  cts: "typescript",
  js: "javascript",
  jsx: "javascript",
  mjs: "javascript",
  cjs: "javascript",
  json: "json",
  css: "css",
  scss: "css",
  html: "xml",
  xml: "xml",
  svg: "xml",
  rs: "rust",
  yml: "yaml",
  yaml: "yaml",
  md: "markdown",
  sh: "bash",
  bash: "bash",
  zsh: "bash",
  py: "python",
  sql: "sql",
  php: "php",
  go: "go",
};

const MAX_ROWS = 3000;
const MAX_LINE = 1000;

function languageOf(path: string): string | undefined {
  const file = path.slice(path.lastIndexOf("/") + 1);
  const dot = file.lastIndexOf(".");
  if (dot < 0) return undefined;
  return EXTENSIONS[file.slice(dot + 1).toLowerCase()];
}

/**
 * Splitst highlight-HTML per regel. Een span die over een regelgrens loopt
 * wordt aan het eind van de regel gesloten en aan het begin van de volgende
 * heropend. hljs escapet `<` in de tekst, dus elke `<` hier is een span-tag.
 */
function splitLines(html: string): string[] {
  const lines: string[] = [];
  const open: string[] = [];
  let current = "";
  const flush = () => {
    lines.push(current + "</span>".repeat(open.length));
    current = open.join("");
  };
  for (const part of html.split(/(<[^>]*>|\n)/)) {
    if (part === "\n") flush();
    else if (part.startsWith("</")) {
      open.pop();
      current += part;
    } else if (part.startsWith("<")) {
      open.push(part);
      current += part;
    } else current += part;
  }
  lines.push(current + "</span>".repeat(open.length));
  return lines;
}

function highlightStream(texts: string[], language: string): string[] {
  if (texts.length === 0) return [];
  const { value } = hljs.highlight(texts.join("\n"), {
    language,
    ignoreIllegals: true,
  });
  return splitLines(value);
}

const HTML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&#x27;",
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (ch) => HTML_ESCAPES[ch] ?? ch);
}

const WORD_OPEN = '<span class="inspector-diff-word">';

/**
 * Legt een woordmarkering over html die al ge-escaped is (hljs-uitvoer of
 * `escapeHtml`). De segmenten dekken de platte tekst achter die html; een
 * entity en een emoji tellen als één teken. Rond elke tag wordt de markering
 * gesloten en heropend, zodat hij nooit tegen een syntax-span in nest.
 */
export function markWords(html: string, segments: readonly Segment[]): string {
  const flags = segments.flatMap((s) => Array.from(s.text, () => s.changed));
  let out = "";
  let pos = 0;
  let open = false;
  const mark = (on: boolean) => {
    if (on === open) return;
    out += on ? WORD_OPEN : "</span>";
    open = on;
  };
  for (const part of html.split(/(<[^>]*>|&[#\w]+;)/)) {
    if (part.startsWith("<")) {
      mark(false);
      out += part;
    } else if (/^&[#\w]+;$/.test(part)) {
      mark(flags[pos++] ?? false);
      out += part;
    } else {
      for (const ch of part) {
        mark(flags[pos++] ?? false);
        out += ch;
      }
    }
  }
  mark(false);
  return out;
}

/** HTML per rij (door highlight.js ge-escaped, veilig voor innerHTML), of null als de taal onbekend is of de invoer te groot. */
export function highlightRows(
  rows: readonly HighlightRow[],
  path: string,
): (string | null)[] {
  const language = languageOf(path);
  if (
    language === undefined ||
    rows.length > MAX_ROWS ||
    rows.some((r) => r.text.length > MAX_LINE)
  ) {
    return rows.map(() => null);
  }
  const oldLines = highlightStream(
    rows.filter((r) => r.type !== "add").map((r) => r.text),
    language,
  );
  const newLines = highlightStream(
    rows.filter((r) => r.type !== "del").map((r) => r.text),
    language,
  );
  let o = 0;
  let n = 0;
  return rows.map((r) => {
    if (r.type === "del") return oldLines[o++] ?? null;
    if (r.type === "add") return newLines[n++] ?? null;
    o++;
    return newLines[n++] ?? null;
  });
}
