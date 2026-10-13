import { describe, expect, it, vi } from "vitest";
import { fileStatus } from "../../features/prs/diffModel";
import { parseDiff } from "../../features/prs/diffParse";
import { toPrNumber, toRepoId } from "./domain";
import { NetworkError } from "./networkError";
import { buildDiffFromFiles, fetchPrFiles, type PrFile } from "./prFiles";
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

describe("buildDiffFromFiles", () => {
  const patch = "@@ -1,2 +1,2 @@\n keep\n-oud\n+nieuw";

  it("bouwt een diff die parseDiff als één bestand met zijn regels leest", () => {
    const diff = buildDiffFromFiles([
      { filename: "src/a.ts", status: "modified", changes: 2, patch },
    ]);
    const files = parseDiff(diff);
    expect(files.map((f) => f.path)).toEqual(["src/a.ts"]);
    expect(files[0]?.lines.map((l) => l.kind)).toEqual([
      "meta",
      "meta",
      "hunk",
      "context",
      "del",
      "add",
    ]);
    expect(diff).toContain("diff --git a/src/a.ts b/src/a.ts");
    expect(diff).toContain("--- a/src/a.ts\n+++ b/src/a.ts\n@@");
  });

  it("neemt previous_filename mee bij een hernoeming met wijzigingen", () => {
    const diff = buildDiffFromFiles([
      {
        filename: "new.ts",
        status: "renamed",
        changes: 2,
        patch,
        previous_filename: "old.ts",
      },
    ]);
    expect(diff).toContain("diff --git a/old.ts b/new.ts");
    expect(diff).toContain("--- a/old.ts\n+++ b/new.ts");
    expect(parseDiff(diff)[0]?.path).toBe("new.ts");
  });

  it("gebruikt /dev/null voor een toegevoegd en een verwijderd bestand", () => {
    const added = buildDiffFromFiles([
      {
        filename: "n.ts",
        status: "added",
        changes: 1,
        patch: "@@ -0,0 +1 @@\n+x",
      },
    ]);
    expect(added).toContain("--- /dev/null\n+++ b/n.ts");
    const removed = buildDiffFromFiles([
      {
        filename: "d.ts",
        status: "removed",
        changes: 1,
        patch: "@@ -1 +0,0 @@\n-x",
      },
    ]);
    expect(removed).toContain("--- a/d.ts\n+++ /dev/null");
  });

  it("markeert een bestand zonder patch maar met wijzigingen als te groot", () => {
    const diff = buildDiffFromFiles([
      { filename: "big.json", status: "modified", changes: 9000 },
    ]);
    const file = parseDiff(diff)[0];
    expect(fileStatus(file?.lines ?? [])).toBe("Te groot om te tonen");
  });

  it("markeert een bestand zonder patch en zonder wijzigingen als binair", () => {
    const diff = buildDiffFromFiles([
      { filename: "logo.png", status: "modified", changes: 0 },
    ]);
    expect(fileStatus(parseDiff(diff)[0]?.lines ?? [])).toBe("Binair bestand");
  });

  it("toont een zuivere hernoeming als hernoemd", () => {
    const diff = buildDiffFromFiles([
      {
        filename: "b.ts",
        status: "renamed",
        changes: 0,
        previous_filename: "a.ts",
      },
    ]);
    expect(fileStatus(parseDiff(diff)[0]?.lines ?? [])).toBe(
      "Hernoemd van a.ts",
    );
  });

  it("zet meerdere bestanden achter elkaar", () => {
    const diff = buildDiffFromFiles([
      { filename: "a.ts", status: "modified", changes: 2, patch },
      { filename: "b.ts", status: "modified", changes: 2, patch },
    ]);
    expect(parseDiff(diff).map((f) => f.path)).toEqual(["a.ts", "b.ts"]);
  });
});
