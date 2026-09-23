import type { PullRequest } from "../../lib/github/domain";
import { type PrStatus, type PrStatusKey, prStatus } from "./rank";

export type SortMode =
  | "triage"
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
  /** Statuskleur voor de sectiekop-dot; leeg als de sectie geen titel toont. */
  statusKey: PrStatusKey | null;
}

/**
 * Sectietitel per status. De volgorde van de sleutels is de sectievolgorde:
 * eerst wat jouw review vraagt, dan eigen PR's van klaar via actie naar
 * wachten. Het Record dwingt af dat een nieuwe PrStatusKey een sectie krijgt;
 * zonder sectie zou hij stil uit de triage-lijst vallen.
 */
const TRIAGE_TITEL: Record<PrStatusKey, string> = {
  review: "Jouw review nodig",
  klaar: "Klaar om te mergen",
  actie: "Actie nodig",
  wachtReview: "Wacht op review",
  agent: "Agent bezig",
  wachten: "Wachten",
  concept: "Concept",
};

const TRIAGE_ORDER = Object.keys(TRIAGE_TITEL) as PrStatusKey[];

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

/**
 * Triage-volgorde: status-rank, dan PR's zonder probleem voor die met een
 * probleem (in "review": eerst wat je nu kunt reviewen, D7), dan meest
 * recent bijgewerkt.
 */
function byTriage(a: PullRequest, b: PullRequest, ctx: SortCtx): number {
  const sa = statusOf(a, ctx);
  const sb = statusOf(b, ctx);
  return (
    sa.rank - sb.rank ||
    Number(sa.problem != null) - Number(sb.problem != null) ||
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
  if (mode === "omvang") {
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
 * design-script: triage groepeert op statuskey in vaste volgorde, project
 * groepeert per repo (beste rank eerst, via groupKey), de overige modi
 * leveren één ongekopte sectie.
 */
/** Levert de until-instant (ISO) van een gesnoozede PR, of undefined als hij
 * niet gesnoozed is. */
export type SnoozeUntilOf = (pr: PullRequest) => string | undefined;

const LATER_TITEL = "Later";

function laterSection(
  prs: PullRequest[],
  snoozeUntilOf: SnoozeUntilOf,
): PrSection[] {
  if (prs.length === 0) return [];
  const sorted = [...prs].sort((a, b) => {
    const untilA = snoozeUntilOf(a) ?? "";
    const untilB = snoozeUntilOf(b) ?? "";
    return untilA.localeCompare(untilB);
  });
  return [{ key: "later", titel: LATER_TITEL, prs: sorted, statusKey: null }];
}

export function buildSections(
  prs: PullRequest[],
  mode: SortMode,
  ctx: SortCtx,
  snoozeUntilOf?: SnoozeUntilOf,
): PrSection[] {
  const snoozed: PullRequest[] = [];
  const active: PullRequest[] = [];
  for (const pr of prs) {
    if (snoozeUntilOf?.(pr) != null) snoozed.push(pr);
    else active.push(pr);
  }
  const later =
    snoozeUntilOf != null ? laterSection(snoozed, snoozeUntilOf) : [];

  const sorted = sortPrs(active, mode, ctx);

  if (mode === "triage") {
    return [
      ...TRIAGE_ORDER.map((key) => ({
        key,
        titel: TRIAGE_TITEL[key],
        prs: sorted.filter((pr) => statusOf(pr, ctx).key === key),
        statusKey: key,
      })).filter((sec) => sec.prs.length > 0),
      ...later,
    ];
  }

  if (mode === "project") {
    const byRepo = new Map<string, PullRequest[]>();
    for (const pr of sorted) {
      const rows = byRepo.get(pr.repoId) ?? [];
      rows.push(pr);
      byRepo.set(pr.repoId, rows);
    }
    return [
      ...[...byRepo.entries()]
        .map(([repoId, rows]) => ({
          key: repoId,
          titel: repoId,
          prs: rows,
          // Rijen staan al op triage-volgorde, dus de eerste heeft de beste rank.
          best: statusOf(rows[0] as PullRequest, ctx),
        }))
        .sort((a, b) => a.best.rank - b.best.rank)
        .map(({ key, titel, prs: rows, best }) => ({
          key,
          titel,
          prs: rows,
          statusKey: best.key,
        })),
      ...later,
    ];
  }

  if (sorted.length === 0) return later;
  return [{ key: "", titel: "", prs: sorted, statusKey: null }, ...later];
}
