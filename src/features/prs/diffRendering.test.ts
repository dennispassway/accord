import { describe, expect, it } from "vitest";
import {
  buildUnifiedItems,
  contiguousRuns,
  EXPAND_ALL_MAX,
  EXPAND_STEP,
  type Expansion,
  expandContext,
  lineKey,
  matchesFile,
} from "./diffModel";
import type { DiffLine } from "./diffParse";
import { wordSegments } from "./diffSplit";
import { escapeHtml, markWords } from "./highlight";

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

  it("telt een emoji als één teken, ook vóór het gewijzigde woord", () => {
    expect(
      markWords("\u{1F600} b", [
        { text: "\u{1F600} ", changed: false },
        { text: "b", changed: true },
      ]),
    ).toBe(`\u{1F600} ${W("b")}`);
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

const NONE: Expansion = { above: new Map(), below: 0 };
const above = (...entries: [number, number][]): Expansion => ({
  above: new Map(entries),
  below: 0,
});

describe("expandContext", () => {
  const file = Array.from({ length: 30 }, (_, i) => `l${i + 1}`);
  const hunkAt10 = () =>
    buildUnifiedItems(
      lines(["hunk", "@@ -10,1 +10,1 @@"], ["context", " l10"]),
    );
  const numbers = (items: ReturnType<typeof expandContext>) =>
    items.map((i) => (i.kind === "hunk" ? "H" : i.newNo));

  it("klapt van een gat van 700 regels er hooguit 500 uit", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -1,1 +1,1 @@"], ["context", " l1"]),
    );
    const long = Array.from({ length: 701 }, (_, i) => `l${i + 1}`);
    const out = expandContext(items, long, {
      above: new Map(),
      below: EXPAND_ALL_MAX,
    });
    expect(out).toHaveLength(items.length + 500);
    expect(out[out.length - 1]).toMatchObject({ newNo: 501 });
  });

  it("klapt per stap hooguit 20 regels uit", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -50,1 +50,1 @@"], ["context", " l50"]),
    );
    const out = expandContext(items, file, above([0, EXPAND_STEP]));
    expect(out).toHaveLength(items.length + 20);
  });

  it("laat de items ongemoeid als niets is uitgeklapt", () => {
    const items = hunkAt10();
    expect(expandContext(items, file, NONE)).toEqual(items);
  });

  it("zet boven een hunk alleen het gevraagde aantal regels, de dichtstbijzijnde", () => {
    const out = expandContext(hunkAt10(), file, above([0, 3]));
    expect(numbers(out)).toEqual([7, 8, 9, "H", 10]);
    expect(out[0]).toEqual({
      kind: "row",
      type: "context",
      oldNo: 7,
      newNo: 7,
      text: "l7",
    });
  });

  it("kapt het aantal af op de grootte van het gat", () => {
    const out = expandContext(hunkAt10(), file, above([0, 100]));
    expect(numbers(out)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, "H", 10]);
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
    const out = expandContext(items, file, above([1, 3]));
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

  it("zet onder het laatste hunk de eerste regels van de rest", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -3,1 +3,1 @@"], ["context", " l3"]),
    );
    const out = expandContext(items, file, { above: new Map(), below: 4 });
    expect(out.slice(-4).map((i) => (i.kind === "row" ? i.text : "H"))).toEqual(
      ["l4", "l5", "l6", "l7"],
    );
    expect(out).toHaveLength(items.length + 4);
  });

  it("klapt niets uit bij een nieuw bestand", () => {
    const items = buildUnifiedItems(
      lines(["hunk", "@@ -0,0 +1,2 @@"], ["add", "+l1"], ["add", "+l2"]),
    );
    expect(
      expandContext(items, ["l1", "l2"], {
        above: new Map([[0, 5]]),
        below: 5,
      }),
    ).toEqual(items);
  });
});

describe("matchesFile", () => {
  const items = buildUnifiedItems(
    lines(
      ["hunk", "@@ -2,3 +2,3 @@"],
      ["context", " b"],
      ["del", "-oud"],
      ["add", "+nieuw"],
      ["context", " d"],
    ),
  );

  it("is waar als elke regel aan de nieuwe kant in het bestand staat", () => {
    expect(matchesFile(items, ["a", "b", "nieuw", "d", "e"])).toBe(true);
  });

  it("is onwaar als een regel op zijn nummer anders is, of het bestand te kort is", () => {
    expect(matchesFile(items, ["a", "b", "ANDERS", "d"])).toBe(false);
    expect(matchesFile(items, ["a", "b"])).toBe(false);
  });

  it("negeert een CR aan het einde van een regel", () => {
    expect(matchesFile(items, ["a", "b\r", "nieuw", "d\r"])).toBe(true);
  });
});

describe("contiguousRuns", () => {
  it("splitst op een gat tussen twee hunks", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ["context", " a"],
        ["context", " b"],
        ["hunk", "@@ -20,1 +20,1 @@"],
        ["context", " c"],
      ),
    );
    expect(contiguousRuns(items).map((r) => r.map((x) => x.text))).toEqual([
      ["a", "b"],
      ["c"],
    ]);
  });

  it("houdt een verwijderd/toegevoegd blok bij elkaar en laat hunks zonder gat aansluiten", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,2 +1,2 @@"],
        ["context", " a"],
        ["del", "-b"],
        ["add", "+B"],
        ["hunk", "@@ -3,1 +3,1 @@"],
        ["context", " c"],
      ),
    );
    expect(contiguousRuns(items)).toHaveLength(1);
  });

  it("neemt de nummers van de vorige reeks niet mee in een nieuwe reeks", () => {
    // Hunk 2 begint (na een gat) met een verwijderde regel en gaat dan door
    // met context: dat blijft één reeks.
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,1 +1,1 @@"],
        ["context", " a"],
        ["hunk", "@@ -20,2 +19,1 @@"],
        ["del", "-x"],
        ["context", " y"],
      ),
    );
    expect(contiguousRuns(items).map((r) => r.length)).toEqual([1, 2]);
  });

  it("splitst ook als alleen de oude kant doorloopt na een verwijdering met gat", () => {
    const items = buildUnifiedItems(
      lines(
        ["hunk", "@@ -1,1 +1,1 @@"],
        ["context", " a"],
        ["hunk", "@@ -9,1 +9,0 @@"],
        ["del", "-z"],
      ),
    );
    expect(contiguousRuns(items)).toHaveLength(2);
  });
});
