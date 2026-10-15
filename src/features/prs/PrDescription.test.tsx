import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { PrDescription } from "./PrDescription";

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

  it("laat het aantal bestanden weg zonder fileCount", () => {
    const html = renderToStaticMarkup(
      <PrDescription body="kort" add={5} del={2} />,
    );
    expect(html).not.toContain("bestand");
    expect(html).toContain("+5");
  });
});
