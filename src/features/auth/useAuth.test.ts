import { describe, expect, it } from "vitest";
import { loggedOutBody } from "./LoginScreen";
import type { AuthState, LoggedOutReason } from "./types";
import { canRetry, initialAuthState } from "./useAuth";

describe("initialAuthState (U13)", () => {
  it("start op 'checking' zodra er straks echt een token-check gaat lopen", () => {
    expect(initialAuthState("off", true)).toEqual({ status: "checking" });
  });

  it("start op 'unconfigured' als er geen client-id is (geen token-check mogelijk)", () => {
    expect(initialAuthState("off", false)).toEqual({ status: "unconfigured" });
  });

  it("geeft in mockmodus meteen de bijpassende mock-toestand, nooit 'checking'", () => {
    expect(initialAuthState("login-uit", true)).toEqual({
      status: "loggedOut",
      reason: "manual",
    });
    expect(initialAuthState("app", false)).toEqual(
      expect.objectContaining({ status: "loggedIn" }),
    );
  });
});

describe("canRetry (B8)", () => {
  it("biedt alleen een retry-pad vanuit de foutstatus", () => {
    const error: AuthState = { status: "error", message: "verlopen" };
    expect(canRetry(error)).toBe(true);
  });

  it("biedt geen retry vanuit elke andere status", () => {
    const others: AuthState[] = [
      { status: "checking" },
      { status: "unconfigured" },
      { status: "loggedOut", reason: "manual" },
      {
        status: "deviceCodePending",
        userCode: "ABCD-1234",
        verificationUri: "https://github.com/login/device",
      },
      { status: "loggedIn", login: "octocat" },
    ];
    for (const state of others) {
      expect(canRetry(state)).toBe(false);
    }
  });
});

describe("loggedOutBody (U7)", () => {
  it("heeft voor elke reden een eigen, ingevulde tekst", () => {
    const reasons: LoggedOutReason[] = [
      "firstRun",
      "manual",
      "denied",
      "sessionExpired",
      "cancelled",
    ];
    const bodies = reasons.map(loggedOutBody);
    expect(new Set(bodies).size).toBe(reasons.length);
    for (const body of bodies) {
      expect(body.length).toBeGreaterThan(0);
    }
  });

  it("legt de eerste keer uit wat de app doet, niet dat je uitgelogd bent", () => {
    expect(loggedOutBody("firstRun")).not.toMatch(/uitgelogd/);
  });

  it("noemt geweigerde toegang expliciet bij 'denied'", () => {
    expect(loggedOutBody("denied")).toMatch(/geweigerd/);
  });

  it("noemt een verlopen sessie expliciet bij 'sessionExpired'", () => {
    expect(loggedOutBody("sessionExpired")).toMatch(/verlopen/);
  });
});
