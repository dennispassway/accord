import type { PrNumber, PullRequest, RepoId } from "./domain";
import { computeStackInfo, type PrStackInfo } from "./stacks";

export interface RepoGroup {
  repoId: RepoId;
  prs: PullRequest[];
}

function keyOf(repoId: RepoId, number: PrNumber): string {
  return `${repoId}#${number}`;
}

function priorityRank(priority: 1 | 2 | null): number {
  if (priority === 1) return 0;
  if (priority === 2) return 1;
  return 2;
}

function isRedCiAuthoredByMe(pr: PullRequest): boolean {
  return pr.authoredByMe && pr.ciStatus.state === "failure";
}

function comparePrs(
  a: PullRequest,
  b: PullRequest,
  stackInfoByKey: Map<string, PrStackInfo>,
): number {
  const priorityDiff = priorityRank(a.priority) - priorityRank(b.priority);
  if (priorityDiff !== 0) return priorityDiff;

  const aPos =
    stackInfoByKey.get(keyOf(a.repoId, a.number))?.stackPosition ?? 1;
  const bPos =
    stackInfoByKey.get(keyOf(b.repoId, b.number))?.stackPosition ?? 1;
  if (aPos !== bPos) return aPos - bPos;

  const aRedCi = isRedCiAuthoredByMe(a) ? 0 : 1;
  const bRedCi = isRedCiAuthoredByMe(b) ? 0 : 1;
  if (aRedCi !== bRedCi) return aRedCi - bRedCi;

  return a.createdAt.localeCompare(b.createdAt);
}

/**
 * Groups PRs by repo (sorted by name), and within each repo sorts by
 * priority, then stack position (bases before children), then red CI
 * authored by me, then createdAt (oldest first).
 */
export function groupByRepo(prs: PullRequest[]): RepoGroup[] {
  const stackInfoByKey = new Map(
    computeStackInfo(prs).map((info) => [
      keyOf(info.repoId, info.number),
      info,
    ]),
  );

  const byRepo = new Map<RepoId, PullRequest[]>();
  for (const pr of prs) {
    const list = byRepo.get(pr.repoId) ?? [];
    list.push(pr);
    byRepo.set(pr.repoId, list);
  }

  return [...byRepo.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([repoId, repoPrs]) => ({
      repoId,
      prs: [...repoPrs].sort((a, b) => comparePrs(a, b, stackInfoByKey)),
    }));
}
