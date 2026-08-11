import { describe, expect, it } from "vitest";
import { deriveAuthor, toRepoId } from "./domain";

describe("toRepoId", () => {
  it("accepts owner/name form", () => {
    expect(toRepoId("acme/widgets")).toBe("acme/widgets");
  });

  it("rejects a value without a slash", () => {
    expect(() => toRepoId("acme-widgets")).toThrow();
  });
});

describe("deriveAuthor", () => {
  it("treats a plain login as human", () => {
    expect(deriveAuthor("dennis")).toEqual({ kind: "human", login: "dennis" });
  });

  it("treats a [bot] suffix as the claude agent by default", () => {
    expect(deriveAuthor("dependabot[bot]")).toEqual({
      kind: "agent",
      agent: "claude",
      login: "dependabot[bot]",
    });
  });

  it("recognizes claude in the login, case-insensitively", () => {
    expect(deriveAuthor("Claude-Bot")).toEqual({
      kind: "agent",
      agent: "claude",
      login: "Claude-Bot",
    });
  });

  it("recognizes codex in the login", () => {
    expect(deriveAuthor("codex-agent[bot]")).toEqual({
      kind: "agent",
      agent: "codex",
      login: "codex-agent[bot]",
    });
  });
});
