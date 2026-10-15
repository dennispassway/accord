import { describe, expect, it, vi } from "vitest";
import { toRepoId } from "./domain";
import { fetchFileLines } from "./fileContents";
import { NetworkError } from "./networkError";
import { AuthError, GithubApiError } from "./queries";

const repoId = toRepoId("owner/repo");
const sha = "0123456789abcdef0123456789abcdef01234567";

function ok(body: string) {
  return vi.fn().mockResolvedValue(new Response(body, { status: 200 }));
}

function failing(status: number) {
  return vi.fn().mockResolvedValue(new Response("nope", { status }));
}

describe("fetchFileLines", () => {
  it("vraagt de raw-inhoud op met ge-encodeerde padsegmenten en ref", async () => {
    const fetchImpl = ok("a\nb\n");
    await fetchFileLines("tok", repoId, "src/my dir/a#b.ts", sha, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      `https://api.github.com/repos/owner/repo/contents/src/my%20dir/a%23b.ts?ref=${sha}`,
    );
    const headers = init.headers as Record<string, string>;
    expect(headers.Accept).toBe("application/vnd.github.raw");
    expect(headers.Authorization).toBe("Bearer tok");
  });

  it("laat een afsluitende newline geen lege regel opleveren", async () => {
    expect(await fetchFileLines("t", repoId, "a", sha, ok("a\nb\n"))).toEqual([
      "a",
      "b",
    ]);
  });

  it("geeft de laatste regel zonder trailing newline en [] voor een leeg bestand", async () => {
    expect(await fetchFileLines("t", repoId, "a", sha, ok("a\nb"))).toEqual([
      "a",
      "b",
    ]);
    expect(await fetchFileLines("t", repoId, "a", sha, ok(""))).toEqual([]);
  });

  it("strip de carriage return bij CRLF", async () => {
    expect(
      await fetchFileLines("t", repoId, "a", sha, ok("a\r\nb\r\n")),
    ).toEqual(["a", "b"]);
  });

  it("401 throwt AuthError", async () => {
    await expect(
      fetchFileLines("t", repoId, "a", sha, failing(401)),
    ).rejects.toThrow(AuthError);
  });

  it("403 geeft de rate-limit-fout", async () => {
    await expect(
      fetchFileLines("t", repoId, "a", sha, failing(403)),
    ).rejects.toThrow(/rate limit/);
  });

  it("404 throwt GithubApiError", async () => {
    await expect(
      fetchFileLines("t", repoId, "a", sha, failing(404)),
    ).rejects.toThrow(GithubApiError);
  });

  it("een body die tijdens het lezen wegvalt wordt een NetworkError", async () => {
    const response = new Response("x", { status: 200 });
    vi.spyOn(response, "text").mockRejectedValue(new TypeError("Load failed"));
    const f = vi.fn().mockResolvedValue(response);
    await expect(fetchFileLines("t", repoId, "a", sha, f)).rejects.toThrow(
      NetworkError,
    );
  });
});
