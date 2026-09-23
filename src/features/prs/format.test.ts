import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelative, formatSnoozeUntil } from "./format";

const NOW = new Date("2026-07-31T12:00:00Z");

describe("formatRelative", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
  });
  afterEach(() => {
    vi.useRealTimers();
  });

  it("minuten geleden onder het uur", () => {
    expect(formatRelative("2026-07-31T11:40:00Z")).toBe("20 min");
  });

  it("uren geleden onder de dag", () => {
    expect(formatRelative("2026-07-31T10:00:00Z")).toBe("2 u");
  });

  it("dagen geleden", () => {
    expect(formatRelative("2026-07-29T12:00:00Z")).toBe("2 d");
  });
});

describe("formatSnoozeUntil", () => {
  // NOW = 2026-07-31T12:00Z = 2026-07-31T14:00 Amsterdam (zomertijd), vrijdag.
  const now = NOW;

  it("morgen: 'morgen HH:mm'", () => {
    expect(formatSnoozeUntil("2026-08-01T07:00:00.000Z", now)).toBe(
      "morgen 09:00",
    );
  });

  it("vandaag: 'vandaag HH:mm'", () => {
    expect(formatSnoozeUntil("2026-07-31T18:00:00.000Z", now)).toBe(
      "vandaag 20:00",
    );
  });

  it("binnen een week: weekdag-afkorting 'ma HH:mm'", () => {
    // 2026-08-03 is een maandag.
    expect(formatSnoozeUntil("2026-08-03T07:00:00.000Z", now)).toBe("ma 09:00");
  });

  it("verder weg: 'dd-mm HH:mm'", () => {
    expect(formatSnoozeUntil("2026-10-12T12:00:00.000Z", now)).toBe(
      "12-10 14:00",
    );
  });
});
