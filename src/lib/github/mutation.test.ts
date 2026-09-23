import { describe, expect, it } from "vitest";
import { runMutation } from "./mutation";
import { AuthError, GithubApiError } from "./queries";

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

describe("runMutation", () => {
  it("stuurt de query en variables mee en geeft het data-veld terug", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, { data: { thing: { id: "1" } } }),
    );

    const data = await runMutation(
      "token",
      "mutation Foo($threadId: ID!) { foo(threadId: $threadId) }",
      { threadId: "T1" },
      fetchImpl,
      "Geen rechten",
    );

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.github.com/graphql");
    expect(calls[0]?.body.variables).toEqual({ threadId: "T1" });
    expect(calls[0]?.body.query).toContain("foo");
    expect(data).toEqual({ thing: { id: "1" } });
  });

  it("throws AuthError op een 401", async () => {
    const { fetchImpl } = fakeFetch(json(401, {}));

    await expect(
      runMutation("token", "q", {}, fetchImpl, "Geen rechten"),
    ).rejects.toThrow(AuthError);
  });

  it("throws GithubApiError met de meegegeven tekst en de rate-limit-context op een 403", async () => {
    const { fetchImpl } = fakeFetch(
      json(
        403,
        { message: "API rate limit exceeded" },
        { "retry-after": "30" },
      ),
    );

    const call = runMutation(
      "token",
      "q",
      {},
      fetchImpl,
      "Geen schrijfrechten",
    );
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Geen schrijfrechten/);
    await expect(call).rejects.toThrow(/retry-after: 30s/);
  });

  it("throws GithubApiError met de meegegeven tekst en de rate-limit-context op een 429", async () => {
    const { fetchImpl } = fakeFetch(
      json(
        429,
        { message: "API rate limit exceeded" },
        { "x-ratelimit-remaining": "0" },
      ),
    );

    const call = runMutation(
      "token",
      "q",
      {},
      fetchImpl,
      "Geen schrijfrechten",
    );
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Geen schrijfrechten/);
    await expect(call).rejects.toThrow(/x-ratelimit-remaining: 0/);
  });

  it("throws GithubApiError met de servertekst bij een andere niet-ok, niet-401 status", async () => {
    const { fetchImpl } = fakeFetch(json(500, { message: "Server error" }));

    const call = runMutation("token", "q", {}, fetchImpl, "Geen rechten");
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Server error/);
  });

  it("throws GithubApiError met de servermelding op een GraphQL-error", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, { errors: [{ message: "Not authorized" }] }),
    );

    const call = runMutation("token", "q", {}, fetchImpl, "Geen rechten");
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Not authorized/);
  });
});
