import { describe, expect, it } from "vitest";
import { refreshIntervalMs } from "./refreshPolicy";

describe("refreshIntervalMs", () => {
  it("is null (nooit automatisch) bij handmatig, ook verborgen", () => {
    expect(refreshIntervalMs({ refreshMinutes: 0, hidden: false })).toBeNull();
    expect(refreshIntervalMs({ refreshMinutes: 0, hidden: true })).toBeNull();
  });

  it("gebruikt de instelling zichtbaar", () => {
    expect(refreshIntervalMs({ refreshMinutes: 5, hidden: false })).toBe(
      5 * 60 * 1000,
    );
  });

  it("verruimt naar minimaal 15 minuten als het venster verborgen is", () => {
    expect(refreshIntervalMs({ refreshMinutes: 5, hidden: true })).toBe(
      15 * 60 * 1000,
    );
  });

  it("laat een ruimere instelling ongemoeid als het venster verborgen is", () => {
    expect(refreshIntervalMs({ refreshMinutes: 30, hidden: true })).toBe(
      30 * 60 * 1000,
    );
  });
});
