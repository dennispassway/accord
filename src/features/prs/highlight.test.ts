import { describe, expect, it } from "vitest";
import { type HighlightRow, highlightRows } from "./highlight";

const ctx = (text: string): HighlightRow => ({ type: "context", text });
const add = (text: string): HighlightRow => ({ type: "add", text });
const del = (text: string): HighlightRow => ({ type: "del", text });

function plain(html: string): string {
  return html
    .replace(/<[^>]*>/g, "")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

describe("highlightRows", () => {
  it("geeft null voor een onbekende extensie", () => {
    expect(highlightRows([ctx("hello")], "notes.xyz")).toEqual([null]);
    expect(highlightRows([ctx("hello")], "Makefile")).toEqual([null]);
  });

  it("kleurt een keyword in typescript", () => {
    const [html] = highlightRows([add("const x = 1;")], "a.ts");
    expect(html).toContain('<span class="hljs-keyword">const</span>');
  });

  it("escapet <script> in de code", () => {
    const [html] = highlightRows(
      [add("const s = '<script>alert(1)</script>';")],
      "a.ts",
    );
    expect(html).not.toContain("<script");
    expect(html).toContain("&lt;script&gt;");
  });

  it("zet een multiline comment op elke regel binnen een comment-span", () => {
    const out = highlightRows(
      [add("/* een"), add("tweede"), add("derde */"), add("const x = 1;")],
      "a.ts",
    );
    for (const html of out.slice(0, 3)) {
      expect(html).toMatch(/^<span class="hljs-comment">.*<\/span>$/);
    }
    expect(out[3]).not.toContain("hljs-comment");
  });

  it("houdt het aantal regels gelijk", () => {
    const rows = [ctx("a"), del("b"), add("c"), add("d"), ctx("e")];
    expect(highlightRows(rows, "a.js")).toHaveLength(rows.length);
  });

  it("geeft na tags strippen en unescapen de oorspronkelijke tekst", () => {
    const rows = [
      ctx("const a = '<b>&</b>';"),
      del("/* old"),
      del("comment */"),
      add("let y = `x` + (1 < 2);"),
    ];
    const out = highlightRows(rows, "a.ts");
    rows.forEach((row, i) => {
      expect(plain(out[i] as string)).toBe(row.text);
    });
  });

  it("mapt del naar de oude stroom en add naar de nieuwe", () => {
    // oud: een open comment loopt door in de context-regel; nieuw niet
    const out = highlightRows(
      [del("/* oud"), add("const x = 1;"), ctx("regel */")],
      "a.ts",
    );
    expect(out[0]).toContain("hljs-comment");
    expect(out[1]).toContain("hljs-keyword");
    expect(out[2]).not.toBeNull();
  });

  it("geeft alles null bij meer dan 3000 rijen", () => {
    const rows = Array.from({ length: 3001 }, () => ctx("x"));
    expect(highlightRows(rows, "a.ts").every((r) => r === null)).toBe(true);
  });

  it("geeft alles null bij een regel langer dan 1000 tekens", () => {
    const out = highlightRows([ctx("ok"), ctx("a".repeat(1001))], "a.ts");
    expect(out).toEqual([null, null]);
  });

  it("herkent json en rust via de extensie", () => {
    expect(highlightRows([ctx('{"a": 1}')], "x.json")[0]).toContain("hljs-");
    expect(highlightRows([ctx("fn main() {}")], "x.rs")[0]).toContain(
      "hljs-keyword",
    );
  });
});
