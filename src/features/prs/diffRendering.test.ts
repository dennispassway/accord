import { describe, expect, it } from "vitest";
import {
  buildUnifiedItems,
  escapeHtml,
  expandContext,
  lineKey,
  markWords,
  wordSegments,
} from "./diffModel";
import type { DiffLine } from "./diffParse";

function lines(...pairs: [DiffLine["kind"], string][]): DiffLine[] {
  return pairs.map(([kind, text]) => ({ kind, text }));
}

const W = (inner: string) =>
  `<span class="inspector-diff-word">${inner}</span>`;

describe("lineKey", () => {
  it("gebruikt het oude nummer voor een verwijderde regel en het nieuwe voor de rest", () => {
    expect(lineKey("del", 4, null)).toBe("old4");
    expect(lineKey("add", null, 7)).toBe("new7");
    expect(lineKey("context", 3, 5)).toBe("new5");
  });
});

describe("escapeHtml", () => {
  it("escapet de tekens die HTML kent", () => {
    expect(escapeHtml(`<a href="x">&'</a>`)).toBe(
      "&lt;a href=&quot;x&quot;&gt;&amp;&#x27;&lt;/a&gt;",
    );
  });
});

describe("markWords", () => {
  it("omhult een gewijzigd segment in platte tekst", () => {
    expect(
      markWords("foo bar", [
        { text: "foo ", changed: false },
        { text: "bar", changed: true },
      ]),
    ).toBe(`foo ${W("bar")}`);
  });

  it("sluit en heropent de markering rond syntax-spans zodat de nesting klopt", () => {
    const html = `<span class="hljs-keyword">const</span> x`;
    expect(
      markWords(html, [
        { text: "cons", changed: false },
        { text: "t x", changed: true },
      ]),
    ).toBe(`<span class="hljs-keyword">cons${W("t")}</span>${W(" x")}`);
  });

  it("telt een entity als één teken", () => {
    expect(
      markWords("a &amp;&amp; b", [
        { text: "a ", changed: false },
        { text: "&&", changed: true },
        { text: " b", changed: false },
      ]),
    ).toBe(`a ${W("&amp;&amp;")} b`);
  });

  it("laat de html ongemoeid zonder gewijzigd segment", () => {
    const html = `<span class="hljs-string">&quot;x&quot;</span>`;
    expect(markWords(html, [{ text: `"x"`, changed: false }])).toBe(html);
  });

  it("houdt het resultaat veilig voor ge-escapete tekst", () => {
    const out = markWords(escapeHtml("<b>x</b>"), [
      { text: "<b>", changed: false },
      { text: "x", changed: true },
      { text: "</b>", changed: false },
    ]);
    expect(out).toBe(`&lt;b&gt;${W("x")}&lt;/b&gt;`);
  });
});

describe("wordSegments", () => {
  it("paart de i-de verwijderde met de i-de toegevoegde regel", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ["del", "-const a = 1;"],
        ["del", "-const b = 2;"],
        ["add", "+const a = 10;"],
        ["add", "+const b = 20;"],
      ),
    );
    const map = wordSegments(items);
    expect([...map.keys()].sort()).toEqual(["new1", "new2", "old1", "old2"]);
    expect(map.get("old2")).toEqual([
      { text: "const b = ", changed: false },
      { text: "2", changed: true },
      { text: ";", changed: false },
    ]);
    expect(map.get("new2")).toEqual([
      { text: "const b = ", changed: false },
      { text: "20", changed: true },
      { text: ";", changed: false },
    ]);
  });

  it("laat een overtollige verwijderde regel zonder partner met rust", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,1 @@"],
        ["del", "-let x = 1;"],
        ["del", "-let y = 2;"],
        ["add", "+let x = 2;"],
      ),
    );
    expect([...wordSegments(items).keys()].sort()).toEqual(["new1", "old1"]);
  });

  it("paart niet over een contextregel of hunk heen", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,3 +1,3 @@"],
        ["del", "-let x = 1;"],
        ["context", " keep"],
        ["add", "+let x = 2;"],
      ),
    );
    expect(wordSegments(items).size).toBe(0);
  });

  it("slaat een herschreven regel zonder gedeelde tekst over", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -1 +1 @@"], ["del", "-aaaaaa"], ["add", "+zzzzzz"]),
    );
    expect(wordSegments(items).size).toBe(0);
  });
});

describe("expandContext", () => {
  const file = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8"];

  it("laat de items ongemoeid als niets is uitgeklapt", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -3,1 +3,1 @@"], ["context", " l3"]),
    );
    expect(expandContext(items, file, new Set(), false)).toEqual(items);
  });

  it("zet de regels boven een hunk als context vóór dat hunk", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -3,1 +3,1 @@"], ["context", " l3"]),
    );
    const out = expandContext(items, file, new Set([0]), false);
    expect(out.map((i) => (i.kind === "hunk" ? "H" : i.newNo))).toEqual([
      1,
      2,
      "H",
      3,
    ]);
    expect(out[0]).toEqual({
      kind: "row",
      type: "context",
      oldNo: 1,
      newNo: 1,
      text: "l1",
    });
  });

  it("rekent oldNo uit met de offset tussen oud en nieuw", () => {
    // Eerste hunk voegt twee regels toe: in het tweede hunk loopt nieuw 2 voor.
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,1 +1,3 @@"],
        ["add", "+n1"],
        ["add", "+n2"],
        ["context", " l1"],
        ["hunk", "@@ -5,1 +7,1 @@"],
        ["context", " l7"],
      ),
    );
    const out = expandContext(items, file, new Set([1]), false);
    const gap = out.filter(
      (i) => i.kind === "row" && i.newNo != null && i.newNo >= 4 && i.newNo < 7,
    );
    expect(
      gap.map((i) => (i.kind === "row" ? [i.oldNo, i.newNo] : [])),
    ).toEqual([
      [2, 4],
      [3, 5],
      [4, 6],
    ]);
  });

  it("zet de rest van het bestand na het laatste hunk", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -3,1 +3,1 @@"], ["context", " l3"]),
    );
    const out = expandContext(items, file, new Set(), true);
    expect(out.slice(-5).map((i) => (i.kind === "row" ? i.text : "H"))).toEqual(
      ["l4", "l5", "l6", "l7", "l8"],
    );
  });

  it("klapt niets uit bij een nieuw bestand", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -0,0 +1,2 @@"], ["add", "+l1"], ["add", "+l2"]),
    );
    expect(expandContext(items, ["l1", "l2"], new Set([0]), true)).toEqual(
      items,
    );
  });
});
