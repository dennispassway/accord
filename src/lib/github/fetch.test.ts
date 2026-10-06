import { describe, expect, it, vi } from "vitest";
import { searchResponse, validPrNode } from "./fixtures/search-response";
import { NetworkError } from "./networkError";
import { AuthError, fetchAllPrs, GithubApiError } from "./queries";

function jsonResponse(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

type Node = { id: string };
type Searches = Record<"reviewRequested" | "assigned" | "authored", Node[]>;

function isNodesRequest(init: RequestInit): boolean {
  return (JSON.parse(init.body as string) as { query: string }).query.includes(
    "nodes(ids:",
  );
}

function idsOf(init: RequestInit): string[] {
  return (JSON.parse(init.body as string) as { variables: { ids: string[] } })
    .variables.ids;
}

/** Fake GitHub: de search geeft de nodes per bron terug, `nodes(ids:)` zoekt
 * elke id op in dezelfde nodes (onbekend wordt `null`, zoals GitHub doet). */
function fakeGithub(searches: Searches, viewer = "octocat") {
  const byId = new Map(
    Object.values(searches)
      .flat()
      .map((node) => [node.id, node]),
  );
  return vi.fn(async (_url: string, init: RequestInit) =>
    isNodesRequest(init)
      ? jsonResponse(200, {
          data: { nodes: idsOf(init).map((id) => byId.get(id) ?? null) },
        })
      : jsonResponse(200, {
          data: {
            viewer: { login: viewer },
            ...Object.fromEntries(
              Object.entries(searches).map(([alias, nodes]) => [
                alias,
                { issueCount: nodes.length, nodes },
              ]),
            ),
          },
        }),
  );
}

function prNode(number: number) {
  return { ...validPrNode, id: `PR_${number}`, number };
}

const noSleep = () => Promise.resolve();

describe("fetchAllPrs", () => {
  it("posts the aliased search query and merges the three result sets", async () => {
    const fetchImpl = fakeGithub({
      reviewRequested: searchResponse.data.reviewRequested.nodes,
      assigned: [],
      authored: searchResponse.data.authored.nodes,
    });

    const { prs, viewerLogin } = await fetchAllPrs("token-123", fetchImpl);

    expect(prs).toHaveLength(2);
    expect(prs).toContainEqual(
      expect.objectContaining({ number: 42, reviewRequestedFromMe: true }),
    );
    expect(prs).toContainEqual(
      expect.objectContaining({ number: 43, authoredByMe: true }),
    );
    expect(viewerLogin).toBe("octocat");

    for (const [url, init] of fetchImpl.mock.calls) {
      expect(url).toBe("https://api.github.com/graphql");
      expect(init.method).toBe("POST");
      expect((init.headers as Record<string, string>).Authorization).toBe(
        "Bearer token-123",
      );
    }
  });

  it("vraagt eerst alleen de id's op en haalt de velden apart op, zodat geen request tegen GitHubs grens van 10 seconden loopt", async () => {
    const fetchImpl = fakeGithub({
      reviewRequested: [prNode(1)],
      assigned: [],
      authored: [prNode(2)],
    });

    await fetchAllPrs("token", fetchImpl);

    const [first, second] = fetchImpl.mock.calls.map(([, init]) => init);
    expect(isNodesRequest(first as RequestInit)).toBe(false);
    expect(JSON.parse((first as RequestInit).body as string).query).not.toMatch(
      /mergeStateStatus/,
    );
    expect(isNodesRequest(second as RequestInit)).toBe(true);
    expect(idsOf(second as RequestInit)).toEqual(["PR_1", "PR_2"]);
  });

  it("haalt de velden op in batches van hooguit 10 PR's, elke PR één keer", async () => {
    const all = Array.from({ length: 23 }, (_, i) => prNode(i + 1));
    const fetchImpl = fakeGithub({
      reviewRequested: all.slice(0, 15),
      assigned: all.slice(10, 23),
      authored: all.slice(5, 12),
    });

    const { prs } = await fetchAllPrs("token", fetchImpl);

    const batches = fetchImpl.mock.calls
      .map(([, init]) => init)
      .filter(isNodesRequest)
      .map(idsOf);
    expect(batches.map((ids) => ids.length)).toEqual([10, 10, 3]);
    expect(new Set(batches.flat()).size).toBe(23);
    expect(prs).toHaveLength(23);
  });

  it("zet alle vlaggen op een PR die in meerdere searches staat", async () => {
    const fetchImpl = fakeGithub({
      reviewRequested: [],
      assigned: [prNode(7)],
      authored: [prNode(7)],
    });

    const { prs } = await fetchAllPrs("token", fetchImpl);

    expect(prs).toEqual([
      expect.objectContaining({
        number: 7,
        reviewRequestedFromMe: false,
        assignedToMe: true,
        authoredByMe: true,
      }),
    ]);
  });

  it("slaat een PR over die GitHub bij het ophalen van de velden als null teruggeeft", async () => {
    const search = fakeGithub({
      reviewRequested: [prNode(1), prNode(2)],
      assigned: [],
      authored: [],
    });
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
      isNodesRequest(init)
        ? jsonResponse(200, { data: { nodes: [prNode(1), null] } })
        : search(url, init),
    );

    const { prs } = await fetchAllPrs("token", fetchImpl);

    expect(prs.map((pr) => pr.number)).toEqual([1]);
  });

  it("doet geen tweede request als er geen PR's zijn", async () => {
    const fetchImpl = fakeGithub({
      reviewRequested: [],
      assigned: [],
      authored: [],
    });

    const { prs } = await fetchAllPrs("token", fetchImpl);

    expect(prs).toEqual([]);
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });

  it("probeert een batch die een 502 krijgt opnieuw", async () => {
    const github = fakeGithub({
      reviewRequested: [prNode(1)],
      assigned: [],
      authored: [],
    });
    let failed = false;
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) => {
      if (isNodesRequest(init) && !failed) {
        failed = true;
        return new Response("<html>502 Bad Gateway</html>", { status: 502 });
      }
      return github(url, init);
    });

    const { prs } = await fetchAllPrs("token", fetchImpl, { sleep: noSleep });

    expect(prs.map((pr) => pr.number)).toEqual([1]);
  });

  it("faalt in zijn geheel met status, request-id en duur als een batch blijft falen", async () => {
    const github = fakeGithub({
      reviewRequested: [prNode(1)],
      assigned: [],
      authored: [],
    });
    const fetchImpl = vi.fn(async (url: string, init: RequestInit) =>
      isNodesRequest(init)
        ? new Response("<html>502 Bad Gateway</html>", {
            status: 502,
            headers: { "x-github-request-id": "E859:C939C" },
          })
        : github(url, init),
    );

    const result = fetchAllPrs("token", fetchImpl, { sleep: noSleep });

    await expect(result).rejects.toBeInstanceOf(GithubApiError);
    await expect(result).rejects.toThrow(/502.*request-id E859:C939C.*\d+ ms/);
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

  it("geeft dezelfde timeout-tekst bij de AbortError die WKWebView echt gooit", async () => {
    // AbortSignal.timeout() breekt in WebKit af met AbortError, niet met de
    // TimeoutError uit de spec; op die naam alleen toetsen liet de melding
    // in de echte app nooit zien.
    const fetchImpl = vi
      .fn()
      .mockRejectedValue(new DOMException("Fetch is aborted", "AbortError"));

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toThrow(
      /15 seconden/,
    );
  });

  it("vertaalt een netwerkfout naar een Nederlandse melding in plaats van de engine-tekst", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Load failed"));

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toBeInstanceOf(
      NetworkError,
    );
    await expect(fetchAllPrs("token", fetchImpl)).rejects.not.toThrow(
      /Load failed/,
    );
  });

  it("vertaalt ook een verbinding die pas tijdens het lezen van de body wegvalt", async () => {
    // Het antwoord komt binnen, maar de body loopt over dezelfde verbinding:
    // breekt die, dan gooit response.json() en niet de fetch.
    const broken = {
      status: 200,
      ok: true,
      headers: new Headers(),
      json: () => Promise.reject(new TypeError("Load failed")),
    } as unknown as Response;
    const fetchImpl = vi.fn().mockResolvedValue(broken);

    await expect(fetchAllPrs("token", fetchImpl)).rejects.toBeInstanceOf(
      NetworkError,
    );
  });
});
