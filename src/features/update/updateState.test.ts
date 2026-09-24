import { describe, expect, it } from "vitest";
import {
  checkIntervalMs,
  manualCheckMessage,
  toUpdateState,
} from "./updateState";

describe("toUpdateState", () => {
  it("maakt van een gevonden update een zichtbare 'available'-toestand", () => {
    expect(
      toUpdateState(
        { kind: "update", version: "0.2.0", notes: "- Sneller\n- Beter" },
        null,
      ),
    ).toEqual({
      status: "available",
      version: "0.2.0",
      notes: "- Sneller\n- Beter",
    });
  });

  it("blijft stil (idle) als er geen update is", () => {
    expect(toUpdateState({ kind: "none" }, null)).toEqual({ status: "idle" });
  });

  it("blijft stil bij een check-fout: een 404 (eerste release zonder latest.json) of netwerkfout mag nooit UI geven", () => {
    expect(toUpdateState({ kind: "error", message: "404" }, null)).toEqual({
      status: "idle",
    });
  });

  it("toont een weggeklikte versie niet opnieuw", () => {
    expect(
      toUpdateState({ kind: "update", version: "0.2.0", notes: "" }, "0.2.0"),
    ).toEqual({ status: "idle" });
  });

  it("toont een nieuwere versie wél nadat een oudere was weggeklikt", () => {
    expect(
      toUpdateState({ kind: "update", version: "0.3.0", notes: "" }, "0.2.0"),
    ).toEqual({ status: "available", version: "0.3.0", notes: "" });
  });

  it("behandelt een lege dismissed-string als 'niets weggeklikt'", () => {
    expect(
      toUpdateState({ kind: "update", version: "0.2.0", notes: "" }, ""),
    ).toEqual({ status: "available", version: "0.2.0", notes: "" });
  });
});

describe("checkIntervalMs", () => {
  it("volgt het refresh-ritme van de PR-lijst", () => {
    expect(checkIntervalMs(5)).toBe(5 * 60 * 1000);
  });

  it("geeft null bij handmatig verversen (0): dan alleen de check bij opstarten", () => {
    expect(checkIntervalMs(0)).toBeNull();
  });
});

describe("manualCheckMessage", () => {
  it("meldt dat de app bijgewerkt is als er geen update is", () => {
    expect(manualCheckMessage({ kind: "none" })).toBe(
      "Je hebt de nieuwste versie",
    );
  });

  it("maakt een check-fout zichtbaar, anders dan de stille automatische check", () => {
    expect(manualCheckMessage({ kind: "error", message: "offline" })).toBe(
      "Update-check mislukt: offline",
    );
  });

  it("geeft geen melding bij een update: dan verschijnt de banner", () => {
    expect(
      manualCheckMessage({ kind: "update", version: "1.4.0", notes: "" }),
    ).toBeNull();
  });
});
