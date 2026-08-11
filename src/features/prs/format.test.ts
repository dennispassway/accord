import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatRelative } from "./format";

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
