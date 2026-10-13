import { describe, expect, it, vi } from "vitest";
import { toPrNumber, toRepoId } from "./domain";
import { NetworkError } from "./networkError";
import { fetchPrFiles, type PrFile } from "./prFiles";
import { AuthError, GithubApiError } from "./queries";

const repoId = toRepoId("owner/repo");
const prNumber = toPrNumber(7);

function entry(i: number): PrFile {
  return { filename: `f${i}.ts`, status: "modified", changes: 1, patch: "@@" };
}

function page(files: PrFile[]): Response {
  return new Response(JSON.stringify(files), { status: 200 });
}

describe("fetchPrFiles", () => {
  it("vraagt pagina's van 100 op met de juiste URL en headers", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(page([]));
    await fetchPrFiles("tok", repoId, prNumber, fetchImpl);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(
      "https://api.github.com/repos/owner/repo/pulls/7/files?per_page=100&page=1",
    );
    expect((init.headers as Record<string, string>).Authorization).toBe(
      "Bearer tok",
    );
  });

  it("pagineert tot een korte pagina en voegt alles samen", async () => {
    const full = Array.from({ length: 100 }, (_, i) => entry(i));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(full))
      .mockResolvedValueOnce(page([entry(100), entry(101)]));
    const files = await fetchPrFiles("t", repoId, prNumber, fetchImpl);
    expect(files).toHaveLength(102);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect((fetchImpl.mock.calls[1] as [string])[0]).toContain("page=2");
  });

  it("stopt na een lege pagina", async () => {
    const full = Array.from({ length: 100 }, (_, i) => entry(i));
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(page(full))
      .mockResolvedValueOnce(page([]));
    const files = await fetchPrFiles("t", repoId, prNumber, fetchImpl);
    expect(files).toHaveLength(100);
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });

  it("stopt na 30 pagina's", async () => {
    const full = Array.from({ length: 100 }, (_, i) => entry(i));
    const fetchImpl = vi.fn().mockImplementation(async () => page(full));
    const files = await fetchPrFiles("t", repoId, prNumber, fetchImpl);
    expect(fetchImpl).toHaveBeenCalledTimes(30);
    expect(files).toHaveLength(3000);
  });

  it("gooit AuthError bij 401 en GithubApiError bij een andere fout", async () => {
    const status = (s: number) =>
      vi.fn().mockResolvedValue(new Response("nope", { status: s }));
    await expect(
      fetchPrFiles("t", repoId, prNumber, status(401)),
    ).rejects.toBeInstanceOf(AuthError);
    await expect(
      fetchPrFiles("t", repoId, prNumber, status(500)),
    ).rejects.toBeInstanceOf(GithubApiError);
    await expect(
      fetchPrFiles("t", repoId, prNumber, status(429)),
    ).rejects.toThrow(/rate limit/);
  });

  it("verpakt een transportfout als NetworkError", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new TypeError("Load failed"));
    await expect(
      fetchPrFiles("t", repoId, prNumber, fetchImpl),
    ).rejects.toBeInstanceOf(NetworkError);
  });

  it("neemt de blob-sha van een bestand mee", async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(page([{ ...entry(1), sha: "abc123" }]));
    const files = await fetchPrFiles("t", repoId, prNumber, fetchImpl);
    expect(files[0]?.sha).toBe("abc123");
  });

  it("slaat ongeldige entries over", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(
      new Response(JSON.stringify([null, { nope: 1 }, entry(1)]), {
        status: 200,
      }),
    );
    const files = await fetchPrFiles("t", repoId, prNumber, fetchImpl);
    expect(files.map((f) => f.filename)).toEqual(["f1.ts"]);
  });
});
