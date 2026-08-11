import { describe, expect, it } from "vitest";
import { nextLogoutClick } from "./logoutConfirm";

describe("nextLogoutClick", () => {
  it("eerste klik (idle) vraagt om bevestiging", () => {
    expect(nextLogoutClick("idle")).toBe("confirm");
  });

  it("tweede klik (al confirming) logt uit", () => {
    expect(nextLogoutClick("confirming")).toBe("logout");
  });
});
