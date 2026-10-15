import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { DiffView } from "./DiffView";
import { type DraftActions, DraftItem } from "./DraftComposer";
import { parseDiff } from "./diffParse";
import type { ReviewDraft } from "./reviewDrafts";

const DIFF = `diff --git a/a.ts b/a.ts
index 1..2 100644
--- a/a.ts
+++ b/a.ts
@@ -1,3 +1,3 @@
 keep
-oud
+nieuw
 end
`;

const draft = (over: Partial<ReviewDraft> = {}): ReviewDraft => ({
  id: "d1",
  path: "a.ts",
  line: 2,
  side: "RIGHT",
  body: "concept-tekst",
  createdAt: "2026-10-13T09:00:00.000Z",
  commitOid: "c1",
  ...over,
});

function render(
  mode: "unified" | "split",
  drafts: ReviewDraft[] = [],
  withReview = true,
): string {
  const review: DraftActions = {
    drafts,
    onAdd: () => {},
    onEdit: () => {},
    onRemove: () => {},
    onSendLoose: async () => {},
  };
  return renderToStaticMarkup(
    <DiffView
      files={parseDiff(DIFF)}
      tooLarge={false}
      url="https://example.com"
      mode={mode}
      threadsByPath={new Map()}
      onReply={async () => {}}
      onSetResolved={async () => {}}
      drafts={new Map()}
      sending={new Map()}
      review={withReview ? review : undefined}
    />,
  );
}

/** "RIGHT:2" per + in de volgorde van de rijen. */
function gutterButtons(html: string): string[] {
  return [
    ...html.matchAll(
      /aria-label="Opmerking op a\.ts regel (\d+) \((?:oud|nieuw)\)" data-side="(LEFT|RIGHT)"/g,
    ),
  ].map((m) => `${m[2]}:${m[1]}`);
}

describe("DiffView opmerkingen op regels", () => {
  it("toont geen + zonder review-acties", () => {
    expect(gutterButtons(render("unified", [], false))).toEqual([]);
  });

  it("noemt bestand, regel en kant in het label van de knop", () => {
    const html = render("unified");
    expect(html).toContain('aria-label="Opmerking op a.ts regel 2 (oud)"');
    expect(html).toContain('aria-label="Opmerking op a.ts regel 2 (nieuw)"');
  });

  it("zet in unified toevoegingen en context op RIGHT en verwijderingen op LEFT", () => {
    expect(gutterButtons(render("unified"))).toEqual([
      "RIGHT:1",
      "LEFT:2",
      "RIGHT:2",
      "RIGHT:3",
    ]);
  });

  it("geeft in split elke kant zijn eigen regelnummer en kant", () => {
    expect(gutterButtons(render("split"))).toEqual([
      "LEFT:1",
      "RIGHT:1",
      "LEFT:2",
      "RIGHT:2",
      "LEFT:3",
      "RIGHT:3",
    ]);
  });

  it("zet een concept direct na zijn regel met het label in review", () => {
    const html = render("unified", [draft()]);
    expect(html).toContain("in review");
    expect(html.indexOf(">nieuw<")).toBeLessThan(html.indexOf("concept-tekst"));
    expect(html.indexOf("concept-tekst")).toBeLessThan(html.indexOf(">end<"));
    expect(html).toContain("Bewerken");
    expect(html).toContain("Verwijderen");
  });

  it("zet een LEFT-concept na de verwijderde regel en vóór de toegevoegde", () => {
    const html = render("unified", [draft({ side: "LEFT" })]);
    expect(html.indexOf(">oud<")).toBeLessThan(html.indexOf("concept-tekst"));
    expect(html.indexOf("concept-tekst")).toBeLessThan(html.indexOf(">nieuw<"));
  });

  it("toont geen concept van een ander bestand", () => {
    const html = render("unified", [draft({ path: "b.ts" })]);
    expect(html).not.toContain("concept-tekst");
  });

  it("telt de concepten in de bestandskop", () => {
    expect(
      render("unified", [draft(), draft({ id: "d2", line: 3 })]),
    ).toContain("2 in review");
  });
});

describe("DraftItem", () => {
  it("opent met de lopende bewerking van de eigenaar na een remount", () => {
    const html = renderToStaticMarkup(
      <DraftItem
        draft={draft()}
        showSide={false}
        edits={new Map([["d1", "half getypt"]])}
        onEdit={() => {}}
        onRemove={() => {}}
      />,
    );
    expect(html).toContain("half getypt");
    expect(html).toContain("<textarea");
  });
});
