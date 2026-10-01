import type { PullRequest } from "../../lib/github/domain";
import { isBlockedByProtection } from "../../lib/github/merge";
import type { PrStackInfo } from "../../lib/github/stacks";
import type { FixMode } from "../agents/crossReview";

export type ChecklistTone = "ok" | "err" | "warn" | "none";

export type ChecklistKey =
  | "conflict"
  | "checks"
  | "threads"
  | "review"
  | "draft"
  | "behind"
  | "protection"
  | "stack";

export interface ChecklistItem {
  key: ChecklistKey;
  tone: ChecklistTone;
  label: string;
  /** Tweede regel onder het label, bv. de namen van gefaalde checks. */
  detail?: string;
  /** De fixmodus die een agent op dit punt kan draaien; ontbreekt als een agent er niets aan doet. */
  fix?: FixMode;
  /** Houdt dit punt de merge tegen? Gelijk aan of mergeReasons hiervoor een reden geeft. */
  blocking: boolean;
}

function conflictItem(pr: PullRequest): ChecklistItem {
  switch (pr.mergeable) {
    case "MERGEABLE":
      return {
        key: "conflict",
        tone: "ok",
        label: `Geen conflicten met ${pr.baseRef}`,
        blocking: false,
      };
    case "CONFLICTING":
      return {
        key: "conflict",
        tone: "err",
        label: `Conflict met ${pr.baseRef}`,
        fix: "fixConflicts",
        blocking: true,
      };
    case "UNKNOWN":
      return {
        key: "conflict",
        tone: "warn",
        label: "Mergebaarheid onbekend",
        blocking: true,
      };
  }
}

function checksItem(pr: PullRequest): ChecklistItem {
  const ci = pr.ciStatus;
  switch (ci.state) {
    case "success":
      return {
        key: "checks",
        tone: "ok",
        label: "Alle checks geslaagd",
        blocking: false,
      };
    case "failure":
      return {
        key: "checks",
        tone: "err",
        label:
          ci.failedChecks.length === 1
            ? "1 check gefaald"
            : `${ci.failedChecks.length} checks gefaald`,
        detail: ci.failedChecks.join(", "),
        fix: "fixChecks",
        blocking: true,
      };
    case "pending":
      return {
        key: "checks",
        tone: "warn",
        label: "Checks draaien",
        blocking: true,
      };
    case "none":
      return {
        key: "checks",
        tone: "none",
        label: "Geen checks ingesteld",
        blocking: false,
      };
  }
}

function reviewItem(pr: PullRequest): ChecklistItem {
  switch (pr.reviewState.state) {
    case "approved":
      return {
        key: "review",
        tone: "ok",
        label: "Goedgekeurd",
        blocking: false,
      };
    case "changesRequested":
      return {
        key: "review",
        tone: "err",
        label: "Changes requested",
        blocking: true,
      };
    case "reviewRequested":
      return pr.reviewRequestedFromMe && !pr.authoredByMe
        ? {
            key: "review",
            tone: "warn",
            label: "Jouw review is gevraagd",
            detail: "Goedkeuren en changes vragen staan onderaan",
            blocking: true,
          }
        : {
            key: "review",
            tone: "warn",
            label: "Review gevraagd",
            blocking: true,
          };
    case "none":
      return {
        key: "review",
        tone: "none",
        label: "Geen review gevraagd",
        blocking: false,
      };
  }
}

/**
 * Pure: de regels van de merge-checklist in het detailpaneel. Het aantal
 * blocking items is gelijk aan het aantal redenen in `mergeReasons`.
 */
export function mergeChecklist(
  pr: PullRequest,
  stackInfo: PrStackInfo | undefined,
): ChecklistItem[] {
  const items: ChecklistItem[] = [conflictItem(pr), checksItem(pr)];
  if (pr.openThreads > 0) {
    items.push({
      key: "threads",
      tone: "warn",
      label:
        pr.openThreads === 1
          ? "1 open thread"
          : `${pr.openThreads} open threads`,
      fix: "fixComments",
      blocking: false,
    });
  }
  items.push(reviewItem(pr));
  if (pr.isDraft) {
    items.push({
      key: "draft",
      tone: "warn",
      label: "Concept",
      blocking: true,
    });
  }
  if (pr.mergeStateStatus === "BEHIND") {
    items.push({
      key: "behind",
      tone: "warn",
      label: `Loopt achter op ${pr.baseRef}`,
      blocking: true,
    });
  }
  if (isBlockedByProtection(pr)) {
    items.push({
      key: "protection",
      tone: "warn",
      label: "Geblokkeerd door branch protection",
      blocking: true,
    });
  }
  if (stackInfo && stackInfo.blockedByPrNumbers.length > 0) {
    items.push({
      key: "stack",
      tone: "warn",
      label: `Eerst ${stackInfo.blockedByPrNumbers.map((n) => `#${n}`).join(", ")} mergen`,
      blocking: true,
    });
  }
  return items;
}
