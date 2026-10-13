import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiffView } from "./DiffView";
import { parseDiff } from "./diffParse";

const DIFF = `diff --git a/src/a.ts b/src/a.ts
--- a/src/a.ts
+++ b/src/a.ts
@@ -10,3 +10,3 @@
 keep
-const total = 1;
+const total = 2;
 end
`;

const HEAD_AT_ONE = `diff --git a/src/b.ts b/src/b.ts
--- a/src/b.ts
+++ b/src/b.ts
@@ -1,2 +1,2 @@
 keep
-const x = 1;
+const x = 2;
`;

function render(
  diff: string,
  extra: Partial<Parameters<typeof DiffView>[0]> = {},
): string {
  return renderToStaticMarkup(
    <DiffView
      files={parseDiff(diff)}
      tooLarge={false}
      url="https://example.com"
      mode="unified"
      threadsByPath={new Map()}
      onReply={async () => {}}
      onSetResolved={async () => {}}
      drafts={new Map()}
      sending={new Map()}
      {...extra}
    />,
  );
}

describe("DiffView syntax en woorden", () => {
  it("kleurt de code met highlight.js in unified en split", () => {
    expect(render(DIFF)).toContain('class="hljs-keyword"');
    expect(render(DIFF, { mode: "split" })).toContain('class="hljs-keyword"');
  });

  it("markeert het gewijzigde woord in beide helften van een paar", () => {
    const html = render(DIFF);
    expect(html.match(/inspector-diff-word/g)).toHaveLength(2);
    expect(html).toContain('<span class="inspector-diff-word">2</span>');
    expect(
      render(DIFF, { mode: "split" }).match(/inspector-diff-word/g),
    ).toHaveLength(2);
  });

  it("laat rauwe tekst met HTML nooit als markup door", () => {
    const hostile = DIFF.replace(
      "+const total = 2;",
      '+const total = "<img src=x onerror=alert(1)>";',
    );
    const html = render(hostile);
    expect(html).not.toContain("<img");
    expect(html).toContain("&lt;img");
  });

  it("toont gewone tekst voor een onbekende taal", () => {
    const html = render(DIFF.split("a.ts").join("notes.xyz"));
    expect(html).not.toContain("hljs-");
    expect(html).toContain(
      'const total = <span class="inspector-diff-word">1</span>;',
    );
  });
});

describe("DiffView context uitklappen", () => {
  const load = async () => ["x"];

  it("toont boven het hunk het aantal verborgen regels en onderaan de rest", () => {
    const html = render(DIFF, { headSha: "abc", loadFileLines: load });
    expect(html).toContain("↑ 9 regels tonen");
    expect(html).toContain("↓ Rest van het bestand tonen");
  });

  it("toont geen knop boven een hunk dat op regel 1 begint", () => {
    const html = render(HEAD_AT_ONE, { headSha: "abc", loadFileLines: load });
    expect(html).not.toContain("↑");
    expect(html).toContain("↓ Rest van het bestand tonen");
  });

  it("toont geen uitklapknoppen zonder headSha of zonder loader", () => {
    expect(render(DIFF, { headSha: "", loadFileLines: load })).not.toContain(
      "regels tonen",
    );
    expect(render(DIFF, { headSha: "abc" })).not.toContain("regels tonen");
  });

  it("toont geen uitklapknoppen bij een nieuw bestand", () => {
    const added = `diff --git a/n.ts b/n.ts
--- /dev/null
+++ b/n.ts
@@ -0,0 +1,2 @@
+a
+b
`;
    expect(render(added, { headSha: "abc", loadFileLines: load })).not.toMatch(
      /tonen/,
    );
  });
});

describe("DiffView te grote diff", () => {
  it("biedt Per bestand laden naast Open op GitHub", () => {
    const html = render("", {
      tooLarge: true,
      onLoadPerFile: async () => {},
    });
    expect(html).toContain("Per bestand laden");
    expect(html).toContain("Open op GitHub");
  });

  it("toont alleen Open op GitHub zonder loader", () => {
    const html = render("", { tooLarge: true });
    expect(html).not.toContain("Per bestand laden");
  });
});
