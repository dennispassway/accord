import { describe, expect, it } from "vitest";
import { AuthError, GithubApiError } from "./queries";
import { replyToThread, setThreadResolved } from "./threads";

type Call = { url: string; body: { query: string; variables: unknown } };

function fakeFetch(response: Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    calls.push({ url, body: JSON.parse(init.body as string) });
    return response;
  };
  return { fetchImpl, calls };
}

function json(status: number, body: unknown, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("replyToThread", () => {
  it("stuurt de addPullRequestReviewThreadReply-mutatie met threadId en body", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { addPullRequestReviewThreadReply: { comment: { id: "C1" } } },
      }),
    );

    await replyToThread("token", "PRRT_1", "Klinkt goed", fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.github.com/graphql");
    expect(calls[0]?.body.variables).toEqual({
      threadId: "PRRT_1",
      body: "Klinkt goed",
    });
    expect(calls[0]?.body.query).toContain("addPullRequestReviewThreadReply");
  });

  it("geeft de geplaatste comment terug zoals GitHub 'm registreert", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, {
        data: {
          addPullRequestReviewThreadReply: {
            comment: {
              author: { login: "octocat" },
              bodyText: "Klinkt goed",
              body: "Klinkt goed",
              createdAt: "2026-09-01T00:00:00Z",
            },
          },
        },
      }),
    );

    const comment = await replyToThread(
      "token",
      "PRRT_1",
      "Klinkt goed",
      fetchImpl,
    );

    expect(comment).toEqual({
      author: { kind: "human", login: "octocat" },
      bodyText: "Klinkt goed",
      body: "Klinkt goed",
      createdAt: "2026-09-01T00:00:00Z",
    });
  });

  it("trimt de body en stuurt de getrimde waarde mee", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { addPullRequestReviewThreadReply: { comment: { id: "C1" } } },
      }),
    );

    await replyToThread("token", "PRRT_1", "  met witruimte  ", fetchImpl);

    expect(calls[0]?.body.variables).toEqual({
      threadId: "PRRT_1",
      body: "met witruimte",
    });
  });

  it.each([undefined, null, "", "   "])(
    "gooit vóór elke aanvraag bij een lege body (%p)",
    async (body) => {
      const { fetchImpl, calls } = fakeFetch(json(200, { data: {} }));

      await expect(
        replyToThread("token", "PRRT_1", body as unknown as string, fetchImpl),
      ).rejects.toThrow();
      expect(calls).toHaveLength(0);
    },
  );

  it("throws AuthError op een 401", async () => {
    const { fetchImpl } = fakeFetch(json(401, {}));

    await expect(
      replyToThread("token", "PRRT_1", "hoi", fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("throws GithubApiError met de rechten/rate-limit-tekst op een 403", async () => {
    const { fetchImpl } = fakeFetch(
      json(
        403,
        { message: "API rate limit exceeded" },
        { "retry-after": "30" },
      ),
    );

    const call = replyToThread("token", "PRRT_1", "hoi", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/rate limit|schrijfrechten/);
    await expect(call).rejects.toThrow(/retry-after: 30s/);
  });

  it("throws GithubApiError bij een niet-ok, niet-401 response", async () => {
    const { fetchImpl } = fakeFetch(json(500, { message: "Server error" }));

    await expect(
      replyToThread("token", "PRRT_1", "hoi", fetchImpl),
    ).rejects.toThrow(GithubApiError);
  });

  it("throws GithubApiError met de servermelding op een GraphQL-error", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, { errors: [{ message: "Thread not found" }] }),
    );

    const call = replyToThread("token", "PRRT_1", "hoi", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Thread not found/);
  });
});

describe("setThreadResolved", () => {
  it("stuurt de resolveReviewThread-mutatie bij resolved=true", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { resolveReviewThread: { thread: { id: "PRRT_1" } } },
      }),
    );

    await setThreadResolved("token", "PRRT_1", true, fetchImpl);

    expect(calls[0]?.body.query).toContain("resolveReviewThread");
    expect(calls[0]?.body.query).not.toContain("unresolveReviewThread");
    expect(calls[0]?.body.variables).toEqual({ threadId: "PRRT_1" });
  });

  it("stuurt de unresolveReviewThread-mutatie bij resolved=false", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { unresolveReviewThread: { thread: { id: "PRRT_1" } } },
      }),
    );

    await setThreadResolved("token", "PRRT_1", false, fetchImpl);

    expect(calls[0]?.body.query).toContain("unresolveReviewThread");
  });

  it("throws AuthError op een 401", async () => {
    const { fetchImpl } = fakeFetch(json(401, {}));

    await expect(
      setThreadResolved("token", "PRRT_1", true, fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("throws GithubApiError met de servermelding op een GraphQL-error", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, { errors: [{ message: "Not authorized" }] }),
    );

    const call = setThreadResolved("token", "PRRT_1", true, fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Not authorized/);
  });
});
