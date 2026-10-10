import { describe, expect, it } from "vitest";
import { tidyReleaseNotes } from "./releaseNotes";

// De body van v1.8.0 zoals release-please hem in latest.json zet (ingekort).
const RELEASE_PLEASE_BODY = `## [1.8.0](https://github.com/dennispassway/accord/compare/v1.7.0...v1.8.0) (2026-10-08)


### Nieuw

* **agents:** lichte afsluiting voor conflict- en CI-fixes ([7341685](https://github.com/dennispassway/accord/commit/7341685ec5c7b2ea85629c29ce942de2cf8030f9))
* **prs:** toon of een comments-review fixes nodig vindt ([#92](https://github.com/dennispassway/accord/issues/92)) ([7d1396a](https://github.com/dennispassway/accord/commit/7d1396a5dcdd8dd6f47d08275a746b06a2b64f51))


### Opgelost

* **settings:** describe learnings trigger after fixes ([9d62465](https://github.com/dennispassway/accord/commit/9d62465bcafdd627f1fdad58d65fbca0d92eab46))
`;

describe("tidyReleaseNotes", () => {
  it("haalt de versiekop weg, want de kaarttitel noemt de versie al", () => {
    const tidy = tidyReleaseNotes(RELEASE_PLEASE_BODY);
    expect(tidy).not.toContain("1.8.0");
    expect(tidy.startsWith("### Nieuw")).toBe(true);
  });

  it("haalt de commit-hashlinks weg en laat scope, tekst en PR-link staan", () => {
    const tidy = tidyReleaseNotes(RELEASE_PLEASE_BODY);
    expect(tidy).not.toContain("/commit/");
    expect(tidy).toContain(
      "* **agents:** lichte afsluiting voor conflict- en CI-fixes\n",
    );
    expect(tidy).toContain(
      "* **prs:** toon of een comments-review fixes nodig vindt ([#92](https://github.com/dennispassway/accord/issues/92))\n",
    );
    expect(tidy).toContain(
      "* **settings:** describe learnings trigger after fixes",
    );
  });

  it("laat notes zonder release-please-vorm ongewijzigd", () => {
    const notes = "## Wat is er nieuw\n\n- Sneller\n- Beter";
    expect(tidyReleaseNotes(notes)).toBe(notes);
  });
});
