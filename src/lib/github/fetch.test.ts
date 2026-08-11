import { describe, expect, it, vi } from "vitest";
import { searchResponse } from "./fixtures/search-response";
import { AuthError, fetchAllPrs, GithubApiError } from "./queries";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

describe("fetchAllPrs", () => {
  it("posts the aliased search query and merges the three result sets", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, searchResponse));

    const { prs, viewerLogin } = await fetchAllPrs("token-123", fetchImpl);

    expect(prs).toHaveLength(2);
    expect(prs).toContainEqual(
      expect.objectContaining({ number: 42, reviewRequestedFromMe: true }),
    );
    expect(prs).toContainEqual(
      expect.objectContaining({ number: 43, authoredByMe: true }),
    );
    expect(viewerLogin).toBe("octocat");

    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("https://api.github.com/graphql");
    expect(init.method).toBe("POST");
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer token-123",
    );
  });

  it("zet truncated op true zodra een van de drie searches is afgekapt", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          viewer: { login: "dennispassway" },
          reviewRequested: { issueCount: 120, nodes: [] },
          assigned: { issueCount: 0, nodes: [] },
          authored: { issueCount: 0, nodes: [] },
        },
      }),
    );

    const { truncated } = await fetchAllPrs("token-123", fetchImpl);
    expect(truncated).toBe(true);
  });

  it("zet truncated op false als geen van de drie searches is afgekapt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(200, searchResponse));

    const { truncated } = await fetchAllPrs("token-123", fetchImpl);
    expect(truncated).toBe(false);
  });

  it("geeft viewerLogin null als de response geen viewer-veld bevat", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          reviewRequested: { nodes: [] },
          assigned: { nodes: [] },
          authored: { nodes: [] },
        },
      }),
    );

    const { viewerLogin } = await fetchAllPrs("token-123", fetchImpl);
    expect(viewerLogin).toBeNull();
  });

  it("throws AuthError on a 401 response", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(401, { message: "Bad credentials" }));

    await expect(fetchAllPrs("bad-token", fetchImpl)).rejects.toBeInstanceOf(
      AuthError,
    );
  });

  it("throws GithubApiError on other non-ok responses", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(jsonResponse(500, { message: "boom" }));

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toBeInstanceOf(
      GithubApiError,
    );
  });

  it("throws GithubApiError when the GraphQL errors array reports a missing search alias", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      jsonResponse(200, {
        data: {
          reviewRequested: null,
          assigned: { nodes: [] },
          authored: { nodes: [] },
        },
        errors: [
          { message: "Something went wrong while executing your query." },
        ],
      }),
    );

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toThrow(
      "Something went wrong while executing your query.",
    );
  });

  it("mentions a possible rate limit and the retry-after header on a 403 (U5)", async () => {
    const fetchImpl = vi.fn().mockImplementation(
      () =>
        new Response(JSON.stringify({ message: "API rate limit exceeded" }), {
          status: 403,
          headers: { "retry-after": "30" },
        }),
    );

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toThrow(/rate limit/);
    await expect(fetchAllPrs("token", fetchImpl)).rejects.toThrow(
      /retry-after: 30s/,
    );
  });

  it("throws a leesbare Nederlandse foutmelding als de aanvraag timet out (U4)", async () => {
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(
        new DOMException("The operation timed out.", "TimeoutError"),
      );

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toThrow(
      /15 seconden/,
    );
  });
});
