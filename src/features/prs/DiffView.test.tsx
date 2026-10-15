import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { deriveAuthor } from "../../lib/github/domain";
import type { DiffSide, ReviewThread } from "../../lib/github/prDetail";
import { DiffView } from "./DiffView";
import { groupThreadsByFile } from "./diffModel";
import { parseDiff } from "./diffParse";

const DIFF = `diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@ function foo()
 keep
-oud
+nieuw
 end
diff --git a/pnpm-lock.yaml b/pnpm-lock.yaml
--- a/pnpm-lock.yaml
+++ b/pnpm-lock.yaml
@@ -1,1 +1,1 @@
-x
+y
diff --git a/img.png b/img.png
index 1..2 100644
Binary files a/img.png and b/img.png differ
`;

function thread(
  id: string,
  line: number | null,
  diffSide: DiffSide,
  overrides: Partial<ReviewThread> = {},
): ReviewThread {
  const author = deriveAuthor("octocat");
  return {
    id,
    path: "a.ts",
    line,
    diffSide,
    isResolved: false,
    viewerCanReply: true,
    viewerCanResolve: true,
    viewerCanUnresolve: true,
    comments: [
      {
        author,
        bodyText: `tekst-${id}`,
        body: `tekst-${id}`,
        createdAt: "2026-07-28T10:00:00Z",
      },
    ],
    ...overrides,
  };
}

function render(
  threads: ReviewThread[],
  mode: "unified" | "split" = "unified",
  drafts: Map<string, string> = new Map(),
): string {
  const files = parseDiff(DIFF);
  return renderToStaticMarkup(
    <DiffView
      files={files}
      tooLarge={false}
      url="https://example.com"
      mode={mode}
      threadsByPath={groupThreadsByFile(files, threads).byPath}
      onReply={async () => {}}
      onSetResolved={async () => {}}
      drafts={drafts}
      sending={new Map()}
    />,
  );
}

describe("DiffView", () => {
  it("zet een thread direct na zijn regel", () => {
    const html = render([thread("t1", 2, "RIGHT")]);
    expect(html.indexOf("nieuw")).toBeLessThan(html.indexOf("tekst-t1"));
    expect(html.indexOf("tekst-t1")).toBeLessThan(html.indexOf("end"));
  });

  it("zet een LEFT-thread na de verwijderde en vóór de toegevoegde regel", () => {
    const html = render([thread("t2", 2, "LEFT")]);
    expect(html.indexOf(">oud<")).toBeLessThan(html.indexOf("tekst-t2"));
    expect(html.indexOf("tekst-t2")).toBeLessThan(html.indexOf(">nieuw<"));
  });

  it("toont in split de kant van de thread, in unified niet", () => {
    expect(render([thread("t2", 2, "LEFT")], "split")).toContain(
      'inspector-thread-side">oud<',
    );
    expect(render([thread("t1", 2, "RIGHT")], "split")).toContain(
      'inspector-thread-side">nieuw<',
    );
    expect(render([thread("t2", 2, "LEFT")])).not.toContain(
      "inspector-thread-side",
    );
  });

  it("rendert geen lege threadkop onder zijn regel", () => {
    expect(render([thread("t1", 2, "RIGHT")])).not.toContain(
      "inspector-thread-head",
    );
  });

  it("toont een thread zonder plek in een ingeklapt blok met neutrale tekst", () => {
    const html = render([thread("t3", 99, "RIGHT")]);
    expect(html).toContain("1 thread niet bij een regel in deze diff");
    expect(html).toContain("Threads tonen");
    expect(html).toMatch(/aria-controls="[^"]+"/);
    expect(html).not.toContain("tekst-t3");
  });

  it("toont de aantallen threads in de bestandskop", () => {
    const html = render([
      thread("t1", 2, "RIGHT"),
      thread("t2", 2, "LEFT", { isResolved: true }),
    ]);
    expect(html).toContain("1/2 open");
  });

  it("toont geen metaregels en klapt gegenereerde bestanden in", () => {
    const html = render([]);
    expect(html).not.toContain("index 1..2");
    expect(html).toContain("gegenereerd");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">y<");
  });

  it("laat een gegenereerd bestand met een open thread openstaan", () => {
    const html = render([thread("t4", 1, "RIGHT", { path: "pnpm-lock.yaml" })]);
    expect(html).toContain(">y<");
    expect(html).toContain("tekst-t4");
  });

  it("toont de functiecontext van een hunk", () => {
    expect(render([])).toContain("function foo()");
  });

  it("toont een korte regel voor een bestand zonder hunks", () => {
    expect(render([])).toContain("Binair bestand");
  });

  it("opent het antwoordveld met het concept uit drafts", () => {
    const html = render(
      [thread("t1", 2, "RIGHT")],
      "unified",
      new Map([["t1", "mijn concept"]]),
    );
    expect(html).toContain("mijn concept");
    expect(html).toContain("<textarea");
  });
});
