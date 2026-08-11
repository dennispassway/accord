import type { PrNumber, PullRequest, RepoId } from "./domain";

export interface PrStackInfo {
  repoId: RepoId;
  number: PrNumber;
  stackPosition: number;
  stackSize: number;
  blockedByPrNumbers: PrNumber[];
}

/**
 * Builds PR stacks per repo: B stacks on A when B.baseRef === A.headRef.
 * Cycles are broken by treating every PR involved as standalone rather
 * than throwing.
 */
export function computeStackInfo(prs: PullRequest[]): PrStackInfo[] {
  const byRepo = new Map<RepoId, PullRequest[]>();
  for (const pr of prs) {
    const list = byRepo.get(pr.repoId) ?? [];
    list.push(pr);
    byRepo.set(pr.repoId, list);
  }

  const result: PrStackInfo[] = [];
  for (const [repoId, repoPrs] of byRepo) {
    result.push(...computeRepoStackInfo(repoId, repoPrs));
  }
  return result;
}

function computeRepoStackInfo(
  repoId: RepoId,
  repoPrs: PullRequest[],
): PrStackInfo[] {
  const byHeadRef = new Map<string, PullRequest>();
  for (const pr of repoPrs) {
    if (!byHeadRef.has(pr.headRef)) byHeadRef.set(pr.headRef, pr);
  }

  const childrenOfHeadRef = new Map<string, PullRequest[]>();
  for (const pr of repoPrs) {
    const parent = byHeadRef.get(pr.baseRef);
    if (parent && parent !== pr) {
      const kids = childrenOfHeadRef.get(parent.headRef) ?? [];
      kids.push(pr);
      childrenOfHeadRef.set(parent.headRef, kids);
    }
  }

  return repoPrs.map((pr) => {
    const ancestors = collectAncestors(pr, byHeadRef);
    if (!ancestors) {
      return {
        repoId,
        number: pr.number,
        stackPosition: 1,
        stackSize: 1,
        blockedByPrNumbers: [],
      };
    }

    const root = ancestors[0] ?? pr;
    return {
      repoId,
      number: pr.number,
      stackPosition: ancestors.length + 1,
      stackSize: countComponent(root, childrenOfHeadRef),
      blockedByPrNumbers: ancestors.map((a) => a.number),
    };
  });
}

/** Root-first ancestor chain, or undefined when a cycle is detected. */
function collectAncestors(
  pr: PullRequest,
  byHeadRef: Map<string, PullRequest>,
): PullRequest[] | undefined {
  const ancestors: PullRequest[] = [];
  const visited = new Set<string>([pr.headRef]);
  let cursor = pr;

  while (true) {
    const parent = byHeadRef.get(cursor.baseRef);
    if (!parent || parent === cursor) return ancestors;
    if (visited.has(parent.headRef)) return undefined;
    visited.add(parent.headRef);
    ancestors.unshift(parent);
    cursor = parent;
  }
}

function countComponent(
  root: PullRequest,
  childrenOfHeadRef: Map<string, PullRequest[]>,
): number {
  const visited = new Set<string>([root.headRef]);
  const queue = [root];
  for (let current = queue.shift(); current; current = queue.shift()) {
    for (const child of childrenOfHeadRef.get(current.headRef) ?? []) {
      if (!visited.has(child.headRef)) {
        visited.add(child.headRef);
        queue.push(child);
      }
    }
  }
  return visited.size;
}
