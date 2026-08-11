import { describe, expect, it, vi } from "vitest";
import { AuthError, GithubApiError } from "./queries";
import { fetchViewer } from "./user";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchViewer", () => {
  it("returns the viewer on success", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        login: "octocat",
        avatar_url: "https://example.com/a.png",
      }),
    );

    const viewer = await fetchViewer("token-123", fetchImpl);

    expect(viewer).toEqual({
      login: "octocat",
      avatar_url: "https://example.com/a.png",
    });
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/user");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-123",
    );
  });

  it("throws AuthError on a 401 response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { message: "Bad credentials" }));

    await expect(fetchViewer("bad-token", fetchImpl)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("throws GithubApiError on other non-ok responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: "boom" }));

    await expect(fetchViewer("token", fetchImpl)).rejects.toBeInstanceOf(
      GithubApiError,
    );
  });
});
