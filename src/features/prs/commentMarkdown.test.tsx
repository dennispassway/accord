import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CommentBody } from "./commentMarkdown";

// Fictieve Vercel-achtige bot-reactie: rauwe HTML met geneste <picture>,
// <source> en een markdown-tabel, precies de vorm die bots in het echt
// versturen.
const VERCEL_BOT_BODY = `<a href="https://vercel.com/acme/storefront"><sup><img src="https://vercel.com/api/www/avatar?u=acme&s=16" width="16" height="16" align="middle" alt="" /></sup></a> **storefront** – [Visit Preview](https://storefront-git-feature.acme.vercel.app)

| Project | Deployment | Actions | Updated (UTC) |
| --- | --- | --- | --- |
| **storefront** | <a href="https://vercel.com/acme/storefront/abc123">Ready</a> ([Inspect](https://vercel.com/acme/storefront/abc123)) | <a href="https://vercel.com/acme/storefront/abc123" rel="noreferrer"><picture><source media="(prefers-color-scheme: dark)" srcset="https://vercel.com/button-dark.svg"><img src="https://vercel.com/button-light.svg" alt="Request Review"></picture></a> | Sep 23, 2026 2:14pm |
`;

const PLAIN_MARKDOWN_BODY = `\`xargs -r rm -rf\` op basis van \`ls -1t\` voelt kwetsbaar.

- releasemappen zijn timestamps
- \`find -print0\` zou robuuster zijn

\`\`\`bash
find "$RELEASES_DIR" -maxdepth 1 -mindepth 1 | sort
\`\`\`

Zie de [GNU findutils-docs](https://www.gnu.org/software/findutils/).`;

function render(body: string): string {
  return renderToStaticMarkup(<CommentBody>{body}</CommentBody>);
}

describe("CommentBody", () => {
  it("rendert geen letterlijke HTML-markup als tekst", () => {
    const html = render(VERCEL_BOT_BODY);
    expect(html).not.toContain("&lt;a");
    expect(html).not.toContain("&lt;img");
    expect(html).not.toContain("&lt;picture");
  });

  it("rendert nooit een echt <img>-, <script>- of <source>-element", () => {
    const html = render(VERCEL_BOT_BODY);
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script");
    expect(html).not.toContain("<source");
  });

  it("laat style-attributen weg", () => {
    const html = render(VERCEL_BOT_BODY);
    expect(html).not.toContain("style=");
  });

  it("laat event-handler-attributen weg", () => {
    const html = render(VERCEL_BOT_BODY);
    expect(html).not.toMatch(/onclick=/i);
    expect(html).not.toMatch(/onerror=/i);
  });

  it("rendert een javascript:-link niet als href", () => {
    const html = render('<a href="javascript:alert(1)">klik</a> en een tekst.');
    expect(html).not.toContain('href="javascript:');
  });

  it("rendert de tabel als een echte <table>, in een scrollcontainer", () => {
    const html = render(VERCEL_BOT_BODY);
    expect(html).toContain("<table");
    expect(html).toContain("inspector-comment-text-table-wrap");
    expect(html).toContain("Ready");
    expect(html).toContain("Request Review");
  });

  it("toont niets voor een afbeelding zonder alt-tekst", () => {
    const html = render(
      '<img src="https://vercel.com/api/www/avatar?u=acme&s=16" alt="" />',
    );
    expect(html).not.toContain("inspector-comment-image");
  });

  it("toont de alt-tekst voor een afbeelding met omschrijving", () => {
    const html = render('<img src="https://example.com/x.png" alt="Klaar" />');
    expect(html).toContain("Klaar");
    expect(html).not.toContain("<img");
  });

  it("strip style/class/id op elk element, niet alleen th/td", () => {
    const html = render(
      '<div style="position:fixed;inset:0">x</div> <span style="color:red">y</span> <p style="font-size:99px">z</p>',
    );
    expect(html).not.toContain("style=");
    expect(html).not.toContain("class=");
    expect(html).not.toContain("id=");
  });

  it("blijft gewone markdown zoals voorheen renderen", () => {
    const html = render(PLAIN_MARKDOWN_BODY);
    expect(html).toContain("<pre");
    expect(html).toContain("<code");
    expect(html).toContain("<ul");
    expect(html).toContain("<li");
    expect(html).toContain('href="https://www.gnu.org/software/findutils/"');
    expect(html).toContain("GNU findutils-docs");
  });
});
