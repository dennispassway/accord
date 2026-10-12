import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { ReviewThread } from "../../lib/github/prDetail";
import { DiffView } from "./DiffView";
import { PrDescription } from "./PrDescription";

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
`;

function thread(
  id: string,
  line: number | null,
  diffSide: "LEFT" | "RIGHT",
): ReviewThread {
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
        author: { login: "octocat", avatarUrl: "" },
        body: `tekst-${id}`,
        createdAt: "2026-07-28T10:00:00Z",
      },
    ],
  } as unknown as ReviewThread;
}

function render(
  threads: ReviewThread[],
  mode: "unified" | "split" = "unified",
): string {
  return renderToStaticMarkup(
    <DiffView
      diff={DIFF}
      tooLarge={false}
      url="https://example.com"
      mode={mode}
      threads={threads}
      onReply={async () => {}}
      onSetResolved={async () => {}}
    />,
  );
}

describe("DiffView", () => {
  it("zet een thread direct na zijn regel", () => {
    const html = render([thread("t1", 2, "RIGHT")]);
    expect(html.indexOf("nieuw")).toBeLessThan(html.indexOf("tekst-t1"));
    expect(html.indexOf("tekst-t1")).toBeLessThan(html.indexOf("end"));
  });

  it("zet een LEFT-thread op de verwijderde regel", () => {
    const html = render([thread("t2", 2, "LEFT")], "split");
    expect(html.indexOf("oud")).toBeLessThan(html.indexOf("tekst-t2"));
    expect(html.indexOf("tekst-t2")).toBeLessThan(html.indexOf("end"));
  });

  it("toont een thread zonder plek in een ingeklapt outdated-blok", () => {
    const html = render([thread("t3", 99, "RIGHT")]);
    expect(html).toContain(
      "1 thread bij code die niet meer in deze diff staat",
    );
    expect(html).not.toContain("tekst-t3");
  });

  it("toont geen metaregels en klapt gegenereerde bestanden in", () => {
    const html = render([]);
    expect(html).not.toContain("index 1..2");
    expect(html).toContain("gegenereerd");
    expect(html).toContain('aria-expanded="false"');
    expect(html).not.toContain(">y<");
  });

  it("toont de functiecontext van een hunk", () => {
    expect(render([])).toContain("function foo()");
  });
});

describe("PrDescription", () => {
  it("toont een lege beschrijving als tekst zonder knop", () => {
    const html = renderToStaticMarkup(
      <PrDescription body={"  \n"} fileCount={2} add={3} del={1} />,
    );
    expect(html).toContain("Geen beschrijving.");
    expect(html).not.toContain("<button");
    expect(html).toContain("2 bestanden");
  });

  it("klapt een lange beschrijving standaard in", () => {
    const html = renderToStaticMarkup(
      <PrDescription body={"x".repeat(400)} fileCount={1} add={0} del={0} />,
    );
    expect(html).toContain("collapsed");
    expect(html).toContain("Hele beschrijving tonen");
  });
});
