import { invoke } from "@tauri-apps/api/core";
import { isMockApp, mockMode } from "../mock/mode";
import type { PrNumber, PullRequest } from "./domain";

const IS_MOCK = isMockApp(mockMode());

export interface StackRebaseStep {
  prNumber: PrNumber;
  /** headRef van de te rebasen PR. */
  branch: string;
  /** branch waarvan de oude base-sha geldt (direct kind: de headRef van de
   * gemergde PR; hoger in de stapel: de headRef van de vorige stap). */
  parentBranch: string;
  /** refnaam waar hij op komt, zonder origin/-prefix. */
  newBase: string;
}

/**
 * Plant de rebase van elke PR die (direct of indirect) op `mergedPr` stapelt,
 * van onder naar boven. Directe kinderen (baseRef === mergedPr.headRef)
 * verhuizen naar mergedPr.baseRef; elke volgende laag verhuist naar de
 * (inmiddels gerebasede) branch van zijn eigen ouder. Geen stapel levert een
 * lege array op.
 */
export function planStackRebase(
  mergedPr: PullRequest,
  prs: PullRequest[],
): StackRebaseStep[] {
  const sameRepo = prs.filter((pr) => pr.repoId === mergedPr.repoId);
  const steps: StackRebaseStep[] = [];
  const visited = new Set<string>([mergedPr.headRef]);

  let frontier = [
    {
      matchBaseRef: mergedPr.headRef,
      parentBranch: mergedPr.headRef,
      newBase: mergedPr.baseRef,
    },
  ];

  while (frontier.length > 0) {
    const next: typeof frontier = [];
    for (const ctx of frontier) {
      for (const child of sameRepo) {
        if (child.baseRef !== ctx.matchBaseRef || visited.has(child.headRef)) {
          continue;
        }
        visited.add(child.headRef);
        steps.push({
          prNumber: child.number,
          branch: child.headRef,
          parentBranch: ctx.parentBranch,
          newBase: ctx.newBase,
        });
        next.push({
          matchBaseRef: child.headRef,
          parentBranch: child.headRef,
          newBase: child.headRef,
        });
      }
    }
    frontier = next;
  }

  return steps;
}

/** Unie van alle branch- en parentBranch-namen uit de stappen: dit zijn de
 * branches waarvan we vóór de merge de sha moeten kennen. De headRef van de
 * gemergde PR zelf zit hier altijd al in (als parentBranch van de eerste
 * stap), dus die hoeft niet apart te worden toegevoegd. */
export function branchesToResolve(steps: StackRebaseStep[]): string[] {
  const names = new Set<string>();
  for (const step of steps) {
    names.add(step.branch);
    names.add(step.parentBranch);
  }
  return [...names];
}

/** Resultaat van resolveBranchShas is niet beschikbaar, dan gaat de merge
 * gewoon door zonder auto-rebase (merge nooit blokkeren op rebase-voorbereiding). */
export async function resolveBranchShas(
  repoPath: string,
  branches: string[],
): Promise<Record<string, string>> {
  if (IS_MOCK) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    return Object.fromEntries(
      branches.map((branch) => [branch, `mock-${branch}`]),
    );
  }
  return invoke<Record<string, string>>("resolve_branch_shas", {
    repoPath,
    branches,
  });
}

export type RebaseResult = "rebased" | "conflict";

export async function rebaseStackBranch(
  repoPath: string,
  branch: string,
  oldBaseSha: string,
  expectedHeadSha: string,
  newBase: string,
): Promise<RebaseResult> {
  if (IS_MOCK) {
    console.info(`[mock] rebase ${branch} van ${oldBaseSha} naar ${newBase}`);
    await new Promise((resolve) => setTimeout(resolve, 1500));
    return "rebased";
  }
  return invoke<RebaseResult>("rebase_stack_branch", {
    repoPath,
    branch,
    oldBaseSha,
    expectedHeadSha,
    newBase,
  });
}
