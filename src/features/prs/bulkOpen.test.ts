import { describe, expect, it } from "vitest";
import { shouldConfirmBulkOpen } from "./bulkOpen";

describe("shouldConfirmBulkOpen", () => {
  it("geen bevestiging bij 5 of minder", () => {
    expect(shouldConfirmBulkOpen(1)).toBe(false);
    expect(shouldConfirmBulkOpen(5)).toBe(false);
  });

  it("bevestiging bij meer dan 5", () => {
    expect(shouldConfirmBulkOpen(6)).toBe(true);
  });
});
