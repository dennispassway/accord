import { describe, expect, it } from "vitest";
import { AuthError, GithubApiError } from "./queries";
import { reviewBlockedReason, submitReview } from "./review";

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

describe("submitReview met regelopmerkingen", () => {
  const ok = () =>
    fakeFetch(
      json(200, {
        data: { addPullRequestReview: { pullRequestReview: { id: "PRR_1" } } },
      }),
    );
  const thread = {
    path: "src/a.ts",
    line: 12,
    side: "RIGHT" as const,
    body: "Waarom hier?",
  };

  it("stuurt threads mee als variabele en declareert ze in de mutatie", async () => {
    const { fetchImpl, calls } = ok();

    await submitReview("token", "PR_1", "COMMENT", "", fetchImpl, [thread]);

    expect(calls[0]?.body.variables).toEqual({
      pullRequestId: "PR_1",
      event: "COMMENT",
      body: "",
      threads: [thread],
    });
    expect(calls[0]?.body.query).toContain("DraftPullRequestReviewThread");
  });

  it("laat threads weg bij een lege lijst", async () => {
    const { fetchImpl, calls } = ok();

    await submitReview("token", "PR_1", "APPROVE", "", fetchImpl, []);

    expect(calls[0]?.body.variables).not.toHaveProperty("threads");
  });

  it("weigert goedkeuren van een eigen PR zonder aanvraag", async () => {
    const { fetchImpl, calls } = ok();
    await expect(
      submitReview("token", "PR_1", "APPROVE", "", fetchImpl, [], true),
    ).rejects.toThrow("Je kunt je eigen PR niet goedkeuren");
    expect(calls).toHaveLength(0);
  });

  it("staat reageren op een eigen PR toe", async () => {
    const { fetchImpl } = ok();
    await expect(
      submitReview("token", "PR_1", "COMMENT", "Hoi", fetchImpl, [], true),
    ).resolves.toBeUndefined();
  });

  it("staat reageren zonder tekst toe als er een thread is", async () => {
    const { fetchImpl } = ok();
    await expect(
      submitReview("token", "PR_1", "COMMENT", "  ", fetchImpl, [thread]),
    ).resolves.toBeUndefined();
  });

  it("weigert changes vragen zonder tekst ook als er een thread is", async () => {
    const { fetchImpl, calls } = ok();
    await expect(
      submitReview("token", "PR_1", "REQUEST_CHANGES", "", fetchImpl, [thread]),
    ).rejects.toThrow(/verplicht/);
    expect(calls).toHaveLength(0);
  });

  it("behandelt null en undefined als lege tekst", async () => {
    const { fetchImpl, calls } = ok();
    await expect(
      submitReview(
        "token",
        "PR_1",
        "COMMENT",
        null as unknown as string,
        fetchImpl,
      ),
    ).rejects.toThrow(/verplicht/);
    await expect(
      submitReview(
        "token",
        "PR_1",
        "COMMENT",
        undefined as unknown as string,
        fetchImpl,
      ),
    ).rejects.toThrow(/verplicht/);
    expect(calls).toHaveLength(0);
  });

  it.each(["", "   ", null, undefined])(
    "weigert een thread met lege tekst (%s) vóór de aanvraag",
    async (empty) => {
      const { fetchImpl, calls } = ok();
      await expect(
        submitReview("token", "PR_1", "APPROVE", "", fetchImpl, [
          { ...thread, body: empty as unknown as string },
        ]),
      ).rejects.toThrow(/opmerking/);
      expect(calls).toHaveLength(0);
    },
  );
});

describe("reviewBlockedReason", () => {
  it("laat goedkeuren toe zonder tekst en zonder concepten", () => {
    expect(reviewBlockedReason("APPROVE", "", 0, false)).toBeNull();
  });

  it("eist tekst bij changes vragen, ook met concepten", () => {
    expect(reviewBlockedReason("REQUEST_CHANGES", " ", 3, false)).toBe(
      "Een reactie is verplicht bij changes vragen",
    );
    expect(reviewBlockedReason("REQUEST_CHANGES", "Fix", 0, false)).toBeNull();
  });

  it("eist tekst bij reageren zonder concepten", () => {
    expect(reviewBlockedReason("COMMENT", "", 0, false)).toBe(
      "Een reactie is verplicht bij reageren zonder opmerkingen op regels",
    );
    expect(reviewBlockedReason("COMMENT", "Hoi", 0, false)).toBeNull();
  });

  it("laat reageren zonder tekst toe als er concepten zijn", () => {
    expect(reviewBlockedReason("COMMENT", "", 1, false)).toBeNull();
  });

  it("staat op een eigen PR alleen reageren toe", () => {
    expect(reviewBlockedReason("APPROVE", "", 0, true)).toBe(
      "Je kunt je eigen PR niet goedkeuren",
    );
    expect(reviewBlockedReason("REQUEST_CHANGES", "Fix", 0, true)).toBe(
      "Je kunt geen changes vragen op je eigen PR",
    );
    expect(reviewBlockedReason("COMMENT", "Hoi", 0, true)).toBeNull();
  });
});
