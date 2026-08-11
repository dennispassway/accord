import type { PullRequest } from "../../lib/github/domain";
import { type PrStatus, type PrStatusKey, prStatus } from "./rank";

export type SortMode =
  | "triage"
  | "prioriteit"
  | "bijgewerkt"
  | "oudste"
  | "omvang"
  | "project";

export interface SortCtx {
  /** Draait er nu een agent-run op deze PR? */
  isAgentBezig: (pr: PullRequest) => boolean;
  /** Zit deze PR vast achter een andere PR in de stack? */
  isStackBlocked: (pr: PullRequest) => boolean;
}

export interface PrSection {
  key: string;
  titel: string;
  prs: PullRequest[];
}

/** Sectievolgorde uit het design-script: jouw review, klaar, actie, agent, wachten, concept. */
const TRIAGE_SECTIONS: {
  rank: PrStatus["rank"];
  key: PrStatusKey;
  titel: string;
}[] = [
  { rank: 2, key: "review", titel: "Jouw review nodig" },
  { rank: 1, key: "klaar", titel: "Klaar om te mergen" },
  { rank: 3, key: "actie", titel: "Actie nodig" },
  { rank: 4, key: "agent", titel: "Agent bezig" },
  { rank: 5, key: "wachten", titel: "Wachten" },
  { rank: 6, key: "concept", titel: "Concept" },
];

function priorityWeight(pr: PullRequest): number {
  if (pr.priority === 1) return 0;
  if (pr.priority === 2) return 1;
  return 2;
}

function statusOf(pr: PullRequest, ctx: SortCtx): PrStatus {
  return prStatus(pr, {
    agentBezig: ctx.isAgentBezig(pr),
    stackBlocked: ctx.isStackBlocked(pr),
  });
}

/** Meest recent bijgewerkt eerst. */
function byRecencyDesc(a: PullRequest, b: PullRequest): number {
  return b.updatedAt.localeCompare(a.updatedAt);
}

/** Triage-volgorde: status-rank, dan prioriteit, dan meest recent bijgewerkt. */
function byTriage(a: PullRequest, b: PullRequest, ctx: SortCtx): number {
  return (
    statusOf(a, ctx).rank - statusOf(b, ctx).rank ||
    priorityWeight(a) - priorityWeight(b) ||
    byRecencyDesc(a, b)
  );
}

/** Porteert sortRows() uit het design-script: bepaalt de rijvolgorde per modus. */
function sortPrs(
  prs: PullRequest[],
  mode: SortMode,
  ctx: SortCtx,
): PullRequest[] {
  const out = [...prs];
  if (mode === "prioriteit") {
    out.sort(
      (a, b) =>
        priorityWeight(a) - priorityWeight(b) ||
        statusOf(a, ctx).rank - statusOf(b, ctx).rank ||
        byRecencyDesc(a, b),
    );
  } else if (mode === "omvang") {
    out.sort(
      (a, b) =>
        a.additions + a.deletions - (b.additions + b.deletions) ||
        statusOf(a, ctx).rank - statusOf(b, ctx).rank,
    );
  } else if (mode === "bijgewerkt") {
    out.sort(byRecencyDesc);
  } else if (mode === "oudste") {
    out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  } else {
    // triage en project delen dezelfde rijvolgorde (design: sortRows() default).
    out.sort((a, b) => byTriage(a, b, ctx));
  }
  return out;
}

/**
 * Bouwt secties uit (prs, mode, ctx), zoals renderVals() in het
 * design-script: triage groepeert op status-rank in vaste volgorde, project
 * groepeert per repo (beste rank eerst, via groupKey), de overige modi
 * leveren één ongekopte sectie.
 */
export function buildSections(
  prs: PullRequest[],
  mode: SortMode,
  ctx: SortCtx,
): PrSection[] {
  const sorted = sortPrs(prs, mode, ctx);

  if (mode === "triage") {
    return TRIAGE_SECTIONS.map((sec) => ({
      key: sec.key,
      titel: sec.titel,
      prs: sorted.filter((pr) => statusOf(pr, ctx).rank === sec.rank),
    })).filter((sec) => sec.prs.length > 0);
  }

  if (mode === "project") {
    const byRepo = new Map<string, PullRequest[]>();
    for (const pr of sorted) {
      const rows = byRepo.get(pr.repoId) ?? [];
      rows.push(pr);
      byRepo.set(pr.repoId, rows);
    }
    return [...byRepo.entries()]
      .map(([repoId, rows]) => ({
        key: repoId,
        titel: repoId,
        prs: rows,
        groupRank: Math.min(...rows.map((pr) => statusOf(pr, ctx).rank)),
      }))
      .sort((a, b) => a.groupRank - b.groupRank)
      .map(({ key, titel, prs: rows }) => ({ key, titel, prs: rows }));
  }

  if (sorted.length === 0) return [];
  return [{ key: "", titel: "", prs: sorted }];
}
