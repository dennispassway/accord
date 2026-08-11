import { describe, expect, it, vi } from "vitest";
import { toPrNumber, toRepoId } from "./domain";
import { fetchPrDetail } from "./prDetail";
import { AuthError, GithubApiError } from "./queries";

function textResponse(status: number, body: string): Response {
  return new Response(body, { status });
}

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

const graphqlBody = {
  data: {
    repository: {
      pullRequest: {
        comments: {
          nodes: [
            {
              author: { login: "dennispassway" },
              bodyText: "second",
              createdAt: "2026-08-02T00:00:00Z",
            },
            {
              author: null,
              bodyText: "first",
              createdAt: "2026-08-01T00:00:00Z",
            },
          ],
        },
        reviewThreads: {
          nodes: [
            {
              path: "src/index.ts",
              line: 12,
              isResolved: false,
              comments: {
                nodes: [
                  {
                    author: { login: "claude" },
                    bodyText: "nit",
                    createdAt: "2026-08-01T12:00:00Z",
                  },
                ],
              },
            },
          ],
        },
      },
    },
  },
};

describe("fetchPrDetail", () => {
  const repoId = toRepoId("owner/repo");
  const prNumber = toPrNumber(42);

  it("mapt diff en comments, met ghost-fallback bij null author, gesorteerd op createdAt", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(200, "diff --git a b"))
      .mockResolvedValueOnce(jsonResponse(200, graphqlBody));

    const detail = await fetchPrDetail(
      "token-123",
      repoId,
      prNumber,
      fetchImpl,
    );

    expect(detail.diff).toBe("diff --git a b");
    expect(detail.diffTooLarge).toBe(false);
    expect(detail.issueComments).toEqual([
      {
        author: { kind: "human", login: "ghost" },
        bodyText: "first",
        createdAt: "2026-08-01T00:00:00Z",
      },
      {
        author: { kind: "human", login: "dennispassway" },
        bodyText: "second",
        createdAt: "2026-08-02T00:00:00Z",
      },
    ]);
    expect(detail.reviewThreads).toEqual([
      {
        path: "src/index.ts",
        line: 12,
        isResolved: false,
        comments: [
          {
            author: { kind: "agent", agent: "claude", login: "claude" },
            bodyText: "nit",
            createdAt: "2026-08-01T12:00:00Z",
          },
        ],
      },
    ]);
  });

  it("406 op de diff geeft diffTooLarge zonder error, comments blijven gevuld", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(406, ""))
      .mockResolvedValueOnce(jsonResponse(200, graphqlBody));

    const detail = await fetchPrDetail(
      "token-123",
      repoId,
      prNumber,
      fetchImpl,
    );

    expect(detail.diff).toBe("");
    expect(detail.diffTooLarge).toBe(true);
    expect(detail.issueComments).toHaveLength(2);
  });

  it("401 op de diff-call throwt AuthError", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(401, "Bad credentials"))
      .mockResolvedValueOnce(jsonResponse(200, graphqlBody));

    await expect(
      fetchPrDetail("token-123", repoId, prNumber, fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("401 op de comments-call throwt AuthError", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(200, "diff --git a b"))
      .mockResolvedValueOnce(jsonResponse(401, { message: "Bad credentials" }));

    await expect(
      fetchPrDetail("token-123", repoId, prNumber, fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("GraphQL errors-body zonder bruikbare data throwt GithubApiError", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(200, "diff --git a b"))
      .mockResolvedValueOnce(
        jsonResponse(200, { errors: [{ message: "Something went wrong" }] }),
      );

    await expect(
      fetchPrDetail("token-123", repoId, prNumber, fetchImpl),
    ).rejects.toThrow(GithubApiError);
  });

  it("slaat een comment zonder createdAt over i.p.v. een ''-fallback te tonen", async () => {
    const bodyWithoutCreatedAt = {
      data: {
        repository: {
          pullRequest: {
            comments: {
              nodes: [
                { author: { login: "dennispassway" }, bodyText: "geen datum" },
                {
                  author: { login: "dennispassway" },
                  bodyText: "met datum",
                  createdAt: "2026-08-02T00:00:00Z",
                },
              ],
            },
            reviewThreads: { nodes: [] },
          },
        },
      },
    };
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(200, "diff --git a b"))
      .mockResolvedValueOnce(jsonResponse(200, bodyWithoutCreatedAt));

    const detail = await fetchPrDetail(
      "token-123",
      repoId,
      prNumber,
      fetchImpl,
    );

    expect(detail.issueComments).toEqual([
      {
        author: { kind: "human", login: "dennispassway" },
        bodyText: "met datum",
        createdAt: "2026-08-02T00:00:00Z",
      },
    ]);
  });

  it("doet de diff-call en de comments-call met de juiste URL, headers en variables", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(textResponse(200, "diff --git a b"))
      .mockResolvedValueOnce(jsonResponse(200, graphqlBody));

    await fetchPrDetail("token-123", repoId, prNumber, fetchImpl);

    expect(fetchImpl).toHaveBeenCalledTimes(2);
    const [diffUrl, diffInit] = fetchImpl.mock.calls[0] as [
      string,
      RequestInit,
    ];
    expect(diffUrl).toBe("https://api.github.com/repos/owner/repo/pulls/42");
    expect((diffInit.headers as Record<string, string>).Accept).toBe(
      "application/vnd.github.diff",
    );

    const [graphqlUrl, graphqlInit] = fetchImpl.mock.calls[1] as [
      string,
      RequestInit,
    ];
    expect(graphqlUrl).toBe("https://api.github.com/graphql");
    const parsedBody = JSON.parse(graphqlInit.body as string) as {
      variables: { owner: string; name: string; number: number };
    };
    expect(parsedBody.variables).toEqual({
      owner: "owner",
      name: "repo",
      number: 42,
    });
  });

  it("429 op de diff-call geeft een GithubApiError met de rate-limit-tekst", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(
        new Response("rate limited", {
          status: 429,
          headers: { "retry-after": "30" },
        }),
      )
      .mockResolvedValueOnce(jsonResponse(200, graphqlBody));

    await expect(
      fetchPrDetail("token-123", repoId, prNumber, fetchImpl),
    ).rejects.toThrow(/rate limit bereikt \(retry-after: 30s\)/);
  });

  it("een TimeoutError op de diff-call geeft een GithubApiError met de Nederlandse timeout-tekst", async () => {
    const timeoutError = new Error("timed out");
    timeoutError.name = "TimeoutError";
    const fetchImpl = vi
      .fn()
      .mockRejectedValueOnce(timeoutError)
      .mockResolvedValueOnce(jsonResponse(200, graphqlBody));

    await expect(
      fetchPrDetail("token-123", repoId, prNumber, fetchImpl),
    ).rejects.toThrow(/GitHub reageerde niet binnen 15 seconden/);
  });
});
