import type { PrNumber, RepoId } from "./domain";
import {
  AuthError,
  type FetchImpl,
  GithubApiError,
  rateLimitNote,
  responseErrorDetail,
} from "./queries";

const PRIORITY_LABELS = { 1: "P1", 2: "P2" } as const;
const PRIORITY_COLORS = { 1: "B60205", 2: "D93F0B" } as const;

/** Welke prioriteitslabels per repo al bekend zijn te bestaan, zodat de
 * blinde create (die meestal 422 geeft) niet elke keer opnieuw vuurt.
 * ponytail: module-lokale in-memory cache, geen TTL/persistentie; leeg bij
 * elke app-herstart is prima want dan is het gewoon weer één 422. */
const knownExistingLabels = new Map<string, Set<"P1" | "P2">>();

/** Test-only: reset de label-existence-cache tussen tests. */
export function _resetKnownLabelsCache(): void {
  knownExistingLabels.clear();
}

function splitRepoId(repoId: RepoId): { owner: string; repo: string } {
  const [owner, repo] = repoId.split("/");
  return { owner: owner ?? "", repo: repo ?? "" };
}

async function githubRequest(
  fetchImpl: FetchImpl,
  token: string,
  url: string,
  init: RequestInit,
): Promise<Response> {
  const response = await fetchImpl(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...init.headers,
    },
  });
  if (response.status === 401) {
    throw new AuthError();
  }
  return response;
}

async function ensureLabelExists(
  fetchImpl: FetchImpl,
  token: string,
  owner: string,
  repo: string,
  priority: 1 | 2,
): Promise<void> {
  const name = PRIORITY_LABELS[priority];
  const repoKey = `${owner}/${repo}`;
  if (knownExistingLabels.get(repoKey)?.has(name)) return;

  const response = await githubRequest(
    fetchImpl,
    token,
    `https://api.github.com/repos/${owner}/${repo}/labels`,
    {
      method: "POST",
      body: JSON.stringify({ name, color: PRIORITY_COLORS[priority] }),
    },
  );
  // 422 means the label already exists: that's fine.
  if (response.ok || response.status === 422) {
    let known = knownExistingLabels.get(repoKey);
    if (known == null) {
      known = new Set();
      knownExistingLabels.set(repoKey, known);
    }
    known.add(name);
    return;
  }
  const detail = await responseErrorDetail(response);
  if (response.status === 403) {
    throw new GithubApiError(
      `Geen schrijfrechten om het label "${name}" aan te maken in ${owner}/${repo}, of een GitHub rate limit${rateLimitNote(response)}: ${detail}`,
    );
  }
  if (response.status === 404) {
    throw new GithubApiError(
      `Geen schrijfrechten om het label "${name}" aan te maken in ${owner}/${repo}: ${detail}`,
    );
  }
  throw new GithubApiError(
    `GitHub API responded with ${response.status}: ${detail}`,
  );
}

async function removeLabelIfPresent(
  fetchImpl: FetchImpl,
  token: string,
  owner: string,
  repo: string,
  number: number,
  name: string,
): Promise<void> {
  const response = await githubRequest(
    fetchImpl,
    token,
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}/labels/${name}`,
    { method: "DELETE" },
  );
  // 404 means the label wasn't on the PR: that's fine.
  if (response.ok || response.status === 404) return;
  throw new GithubApiError(`GitHub API responded with ${response.status}`);
}

async function addLabel(
  fetchImpl: FetchImpl,
  token: string,
  owner: string,
  repo: string,
  number: number,
  name: string,
): Promise<void> {
  const response = await githubRequest(
    fetchImpl,
    token,
    `https://api.github.com/repos/${owner}/${repo}/issues/${number}/labels`,
    { method: "POST", body: JSON.stringify({ labels: [name] }) },
  );
  if (response.ok) return;
  const detail = await responseErrorDetail(response);
  if (response.status === 403) {
    throw new GithubApiError(
      `Geen schrijfrechten om label "${name}" toe te voegen, of een GitHub rate limit${rateLimitNote(response)}: ${detail}`,
    );
  }
  throw new GithubApiError(
    `GitHub API responded with ${response.status}: ${detail}`,
  );
}

/**
 * Sets the P1/P2 priority label on a PR: removes whichever priority label
 * is currently set and applies the requested one (creating it in the repo
 * first if needed). `priority: null` just removes both.
 *
 * `currentPriority` komt van de PR-data die de aanroeper al heeft: alleen
 * het label dat de PR volgens die data echt draagt wordt verwijderd, zodat
 * de blinde DELETE voor het andere (meestal een no-op 404) wegvalt.
 */
export async function setPriority(
  token: string,
  repoId: RepoId,
  prNumber: PrNumber,
  priority: 1 | 2 | null,
  currentPriority: 1 | 2 | null,
  fetchImpl: FetchImpl,
): Promise<void> {
  const { owner, repo } = splitRepoId(repoId);
  const number = prNumber as unknown as number;

  if (currentPriority === 1) {
    await removeLabelIfPresent(fetchImpl, token, owner, repo, number, "P1");
  } else if (currentPriority === 2) {
    await removeLabelIfPresent(fetchImpl, token, owner, repo, number, "P2");
  }

  if (priority == null) return;

  await ensureLabelExists(fetchImpl, token, owner, repo, priority);
  await addLabel(
    fetchImpl,
    token,
    owner,
    repo,
    number,
    PRIORITY_LABELS[priority],
  );
}
