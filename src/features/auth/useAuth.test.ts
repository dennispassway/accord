import { describe, expect, it } from "vitest";
import type { AuthState } from "./types";
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
      { status: "loggedOut" },
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
