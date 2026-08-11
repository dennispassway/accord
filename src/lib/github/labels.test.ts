import { beforeEach, describe, expect, it } from "vitest";
import { toPrNumber, toRepoId } from "./domain";
import { _resetKnownLabelsCache, setPriority } from "./labels";
import { GithubApiError } from "./queries";

const repoId = toRepoId("acme/widgets");
const prNumber = toPrNumber(42);

type Call = { url: string; method: string; body?: unknown };

function fakeFetch(responses: (call: Call) => Response) {
  const calls: Call[] = [];
  const fetchImpl = async (url: string, init: RequestInit) => {
    const call: Call = {
      url,
      method: init.method ?? "GET",
      body: init.body ? JSON.parse(init.body as string) : undefined,
    };
    calls.push(call);
    return responses(call);
  };
  return { fetchImpl, calls };
}

function json(status: number, body: unknown = {}, headers?: HeadersInit) {
  return new Response(JSON.stringify(body), { status, headers });
}

describe("setPriority", () => {
  beforeEach(() => {
    _resetKnownLabelsCache();
  });

  it("sets P1 from no priority: geen DELETE's (de PR draagt nog geen prioriteitslabel)", async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.url.endsWith("/labels") && call.method === "POST" && call.body) {
        const body = call.body as { name?: string; labels?: string[] };
        if (body.name === "P1") return json(201); // label creation
        if (body.labels) return json(200); // label add to PR
      }
      return json(500);
    });

    await setPriority("token", repoId, prNumber, 1, null, fetchImpl);

    expect(calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(calls).toContainEqual({
      url: "https://api.github.com/repos/acme/widgets/labels",
      method: "POST",
      body: { name: "P1", color: "B60205" },
    });
    expect(calls).toContainEqual({
      url: "https://api.github.com/repos/acme/widgets/issues/42/labels",
      method: "POST",
      body: { labels: ["P1"] },
    });
  });

  it("switches P1 naar P2: verwijdert alleen P1 (P2 was niet gezet, dus geen DELETE ervoor)", async () => {
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (call.method === "DELETE") return json(200);
      if (call.body && (call.body as { name?: string }).name === "P2") {
        return json(422); // already exists
      }
      return json(200);
    });

    await setPriority("token", repoId, prNumber, 2, 1, fetchImpl);

    expect(calls).toContainEqual({
      url: "https://api.github.com/repos/acme/widgets/issues/42/labels/P1",
      method: "DELETE",
    });
    expect(
      calls.some((c) => c.method === "DELETE" && c.url.endsWith("/P2")),
    ).toBe(false);
  });

  it("removes priority when set to null: verwijdert alleen het label dat de PR draagt", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200));

    await setPriority("token", repoId, prNumber, null, 2, fetchImpl);

    expect(calls).toEqual([
      {
        url: "https://api.github.com/repos/acme/widgets/issues/42/labels/P2",
        method: "DELETE",
      },
    ]);
  });

  it("does nothing when both target and current priority are null", async () => {
    const { fetchImpl, calls } = fakeFetch(() => json(200));

    await setPriority("token", repoId, prNumber, null, null, fetchImpl);

    expect(calls).toHaveLength(0);
  });

  it("cachet per repo dat een label bestaat: de tweede keer geen blinde create meer", async () => {
    const isCreateCall = (c: Call) =>
      c.url === "https://api.github.com/repos/acme/widgets/labels" &&
      c.method === "POST";
    const { fetchImpl, calls } = fakeFetch((call) => {
      if (isCreateCall(call)) return json(422); // already exists
      return json(200);
    });

    await setPriority("token", repoId, prNumber, 1, null, fetchImpl);
    expect(calls.filter(isCreateCall)).toHaveLength(1);

    await setPriority("token", repoId, prNumber, 1, null, fetchImpl);
    expect(calls.filter(isCreateCall)).toHaveLength(1); // geen tweede create-call
  });

  it("throws a clear GithubApiError when label creation is forbidden", async () => {
    const { fetchImpl } = fakeFetch((call) => {
      if (call.method === "DELETE") return json(200);
      if (call.url.endsWith("/labels") && !call.body?.hasOwnProperty) {
        return json(200);
      }
      return json(403, { message: "Must have admin rights to repository" });
    });

    await expect(
      setPriority("token", repoId, prNumber, 1, null, fetchImpl),
    ).rejects.toThrow(GithubApiError);
    await expect(
      setPriority("token", repoId, prNumber, 1, null, fetchImpl),
    ).rejects.toThrow(/schrijfrechten/);
    await expect(
      setPriority("token", repoId, prNumber, 1, null, fetchImpl),
    ).rejects.toThrow(/Must have admin rights to repository/);
  });

  it("mentions a possible rate limit and the retry-after header on a 403", async () => {
    const { fetchImpl } = fakeFetch((call) => {
      if (call.method === "DELETE") return json(200);
      return json(
        403,
        { message: "API rate limit exceeded" },
        { "retry-after": "30" },
      );
    });

    await expect(
      setPriority("token", repoId, prNumber, 1, null, fetchImpl),
    ).rejects.toThrow(/rate limit/);
    await expect(
      setPriority("token", repoId, prNumber, 1, null, fetchImpl),
    ).rejects.toThrow(/retry-after: 30s/);
  });
});
