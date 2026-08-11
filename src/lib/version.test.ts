import { describe, expect, it } from "vitest";
import { formatVersion } from "./version";

describe("formatVersion", () => {
  it("joins major, minor and patch with dots", () => {
    expect(formatVersion(1, 2, 3)).toBe("1.2.3");
  });
});
