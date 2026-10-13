/**
 * Bestanden van een PR via GET /pulls/{n}/files, voor een diff die te groot
 * is voor het diff-endpoint (406). Loopt net als de rest via `FetchImpl`
 * (tauriFetch), zie .claude/rules/github-http-via-rust.md.
 */
import type { PrNumber, RepoId } from "./domain";
import { withNetworkError } from "./networkError";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";

const FETCH_TIMEOUT_MS = 15_000;
const PER_PAGE = 100;
/** GitHub levert hoogstens 3000 bestanden, dus 30 pagina's van 100. */
const MAX_PAGES = 30;

export interface PrFile {
  filename: string;
  status: string;
  changes: number;
  /** Ontbreekt bij een binair bestand en bij een te grote bestandsdiff. */
  patch?: string;
  previous_filename?: string;
}

function parseFile(raw: unknown): PrFile | null {
  if (raw == null || typeof raw !== "object") return null;
  const file = raw as Partial<Record<keyof PrFile, unknown>>;
  if (typeof file.filename !== "string") return null;
  return {
    filename: file.filename,
    status: typeof file.status === "string" ? file.status : "modified",
    changes: typeof file.changes === "number" ? file.changes : 0,
    ...(typeof file.patch === "string" ? { patch: file.patch } : {}),
    ...(typeof file.previous_filename === "string"
      ? { previous_filename: file.previous_filename }
      : {}),
  };
}

async function fetchPage(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  page: number,
  fetchImpl: FetchImpl,
): Promise<unknown[]> {
  const response = await withNetworkError(() =>
    fetchImpl(
      `https://api.github.com/repos/${repoId}/pulls/${prNumber}/files?per_page=${PER_PAGE}&page=${page}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/vnd.github+json",
          "X-GitHub-Api-Version": "2022-11-28",
        },
        signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      },
    ),
  );

  if (response.status === 401) {
    throw new AuthError();
  }
  if (response.status === 403 || response.status === 429) {
    const detail = await withNetworkError(() => responseErrorDetail(response));
    throw new GithubApiError(
      `GitHub rate limit bereikt${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (!response.ok) {
    throw new GithubApiError(`GitHub API responded with ${response.status}`);
  }
  const json: unknown = await withNetworkError(() => response.json());
  return Array.isArray(json) ? json : [];
}

/** Alle bestanden van de PR, gepagineerd tot een korte of lege pagina. */
export async function fetchPrFiles(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  fetchImpl: FetchImpl,
): Promise<PrFile[]> {
  const files: PrFile[] = [];
  for (let page = 1; page <= MAX_PAGES; page++) {
    const raw = await fetchPage(token, repoId, prNumber, page, fetchImpl);
    for (const entry of raw) {
      const file = parseFile(entry);
      if (file !== null) files.push(file);
    }
    if (raw.length < PER_PAGE) break;
  }
  return files;
}

/** Regel die `fileStatus` als "Te groot om te tonen" leest. */
export const TOO_LARGE_LINE = "Accord: te groot om te tonen";

function fileHeader(file: PrFile): string[] {
  const oldPath = file.previous_filename ?? file.filename;
  const lines = [`diff --git a/${oldPath} b/${file.filename}`];
  if (file.previous_filename !== undefined) {
    lines.push(`rename from ${oldPath}`, `rename to ${file.filename}`);
  }
  if (file.patch !== undefined) {
    lines.push(
      file.status === "added" ? "--- /dev/null" : `--- a/${oldPath}`,
      file.status === "removed" ? "+++ /dev/null" : `+++ b/${file.filename}`,
      file.patch,
    );
    return lines;
  }
  // Zonder patch: te groot als er wel regels wijzigden, anders binair of een
  // zuivere hernoeming (die toont fileStatus aan de hand van de renameregels).
  if (file.changes > 0) lines.push(TOO_LARGE_LINE);
  else if (file.status !== "renamed") {
    lines.push(`Binary files a/${oldPath} and b/${file.filename} differ`);
  }
  return lines;
}

/** Bouwt een unified diff (zoals het diff-endpoint) uit de bestandenlijst,
 * zodat `parseDiff` hem ongewijzigd leest. */
export function buildDiffFromFiles(files: readonly PrFile[]): string {
  return `${files.flatMap(fileHeader).join("\n")}\n`;
}
