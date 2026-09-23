import { describe, expect, it } from "vitest";
import { AuthError, GithubApiError } from "./queries";
import { submitReview } from "./review";

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

describe("submitReview", () => {
  it("sends the addPullRequestReview mutation with pr id, event and body", async () => {
    const { fetchImpl, calls } = fakeFetch(
      json(200, {
        data: { addPullRequestReview: { pullRequestReview: { id: "PRR_1" } } },
      }),
    );

    await submitReview("token", "PR_kwABC", "APPROVE", "", fetchImpl);

    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe("https://api.github.com/graphql");
    expect(calls[0]?.body.variables).toEqual({
      pullRequestId: "PR_kwABC",
      event: "APPROVE",
      body: "",
    });
    expect(calls[0]?.body.query).toContain("addPullRequestReview");
  });

  it("staat goedkeuren zonder tekst toe", async () => {
    const { fetchImpl } = fakeFetch(json(200, { data: {} }));
    await expect(
      submitReview("token", "PR_kwABC", "APPROVE", "  ", fetchImpl),
    ).resolves.toBeUndefined();
  });

  it("weigert changes vragen zonder tekst, zonder een aanvraag te doen", async () => {
    const { fetchImpl, calls } = fakeFetch(json(200, { data: {} }));

    await expect(
      submitReview("token", "PR_kwABC", "REQUEST_CHANGES", "   ", fetchImpl),
    ).rejects.toThrow(/verplicht/);
    expect(calls).toHaveLength(0);
  });

  it("weigert reageren zonder tekst, zonder een aanvraag te doen", async () => {
    const { fetchImpl, calls } = fakeFetch(json(200, { data: {} }));

    await expect(
      submitReview("token", "PR_kwABC", "COMMENT", "", fetchImpl),
    ).rejects.toThrow(/verplicht/);
    expect(calls).toHaveLength(0);
  });

  it("throws AuthError on a 401", async () => {
    const { fetchImpl } = fakeFetch(json(401, {}));

    await expect(
      submitReview("token", "PR_kwABC", "APPROVE", "", fetchImpl),
    ).rejects.toThrow(AuthError);
  });

  it("throws GithubApiError with the server message on a GraphQL error", async () => {
    const { fetchImpl } = fakeFetch(
      json(200, { errors: [{ message: "Review already submitted" }] }),
    );

    const call = submitReview("token", "PR_kwABC", "APPROVE", "", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/already submitted/);
  });

  it("throws GithubApiError with the server message on a non-ok, non-401 response", async () => {
    const { fetchImpl } = fakeFetch(
      json(500, { message: "Something went wrong" }),
    );

    const call = submitReview("token", "PR_kwABC", "APPROVE", "", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/Something went wrong/);
  });

  it("mentions a possible rate limit and the retry-after header on a 403", async () => {
    const { fetchImpl } = fakeFetch(
      json(
        403,
        { message: "API rate limit exceeded" },
        { "retry-after": "30" },
      ),
    );

    const call = submitReview("token", "PR_kwABC", "APPROVE", "", fetchImpl);
    await expect(call).rejects.toThrow(/rate limit/);
    await expect(call).rejects.toThrow(/retry-after: 30s/);
  });

  it("mentions a possible rate limit and the retry-after header on a 429", async () => {
    const { fetchImpl } = fakeFetch(
      json(
        429,
        { message: "API rate limit exceeded" },
        { "retry-after": "30" },
      ),
    );

    const call = submitReview("token", "PR_kwABC", "APPROVE", "", fetchImpl);
    await expect(call).rejects.toThrow(GithubApiError);
    await expect(call).rejects.toThrow(/rate limit/);
    await expect(call).rejects.toThrow(/retry-after: 30s/);
  });
});
