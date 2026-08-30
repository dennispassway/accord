import type { PrNumber, PullRequest, RepoId } from "./domain";

export type StackMergeStop =
  | "rodeCi"
  | "changesRequested"
  | "conflict"
  | "nietMergebaar"
  | "prVerdwenen"
  | "rebaseMislukt"
  | "mergeMislukt"
  | "geannuleerd";

export interface StackMergeProgress {
  stap: number;
  totaal: number;
  bezig: "mergen" | "rebasen" | "wachtenOpCi";
  /** PR-nummers zijn per repo uniek, niet globaal: zonder repoId zou de UI
   * de voortgang op een gelijk genummerde PR in een andere repo tonen. */
  repoId: RepoId;
  prNumber: PrNumber;
}

export interface StackMergeResult {
  gemerged: PrNumber[];
  gestopt?: { reden: StackMergeStop; prNumber: PrNumber };
}

export interface StackMergeDeps {
  /** Merget deze PR (incl. de bestaande auto-rebase van de stapel erboven). */
  mergeStep(pr: PullRequest): Promise<"merged" | "rebase-conflict">;
  /** Verse snapshot van de PR na een refresh, of null als hij niet meer in de lijst staat. */
  refreshPr(prKey: string): Promise<PullRequest | null>;
  delay(ms: number): Promise<void>;
  onProgress(p: StackMergeProgress | null): void;
  isCancelled(): boolean;
}

function keyOf(pr: PullRequest): string {
  return `${pr.repoId}#${pr.number}`;
}

/** Stopcondities op een verse snapshot; leeg betekent: mergen mag door. */
function stopReasonFor(pr: PullRequest): StackMergeStop | null {
  if (pr.ciStatus.state === "failure") return "rodeCi";
  if (pr.reviewState.state === "changesRequested") return "changesRequested";
  if (pr.mergeable === "CONFLICTING") return "conflict";
  // SHOULD 5: geen eigen reden per geval, "nietMergebaar" dekt beide (een
  // PR die tussentijds terug naar draft ging, of waarvan GitHub de
  // mergebaarheid nog niet heeft berekend) zonder de bestaande "conflict"-
  // reden te laten dubbelen voor iets dat geen echt merge-conflict is.
  if (pr.mergeable === "UNKNOWN") return "nietMergebaar";
  if (pr.isDraft) return "nietMergebaar";
  return null;
}

/**
 * Merget een stapel-keten van onder naar boven (`chain[0]` is de onderste,
 * al gemergebare PR). Vóór elke stap ná de eerste wordt gewacht tot de CI van
 * die PR (op de inmiddels gerebasede branch) groen is; daarna worden de
 * stopcondities op een verse snapshot getoetst en pas dan gemerged. Al
 * gemergde stappen blijven staan, ook als een latere stap stopt.
 */
export async function runStackMerge(
  deps: StackMergeDeps,
  chain: PullRequest[],
  pollIntervalMs: number,
): Promise<StackMergeResult> {
  const gemerged: PrNumber[] = [];

  for (let i = 0; i < chain.length; i++) {
    const startPr = chain[i];
    if (startPr == null) continue;

    if (deps.isCancelled()) {
      deps.onProgress(null);
      return {
        gemerged,
        gestopt: { reden: "geannuleerd", prNumber: startPr.number },
      };
    }

    let current = startPr;

    // Vanaf de tweede stap: wachten tot de (gerebasede) branch groene CI heeft.
    if (i > 0) {
      deps.onProgress({
        stap: i + 1,
        totaal: chain.length,
        bezig: "wachtenOpCi",
        repoId: current.repoId,
        prNumber: current.number,
      });
      // SHOULD 4: de allereerste refresh kan nog de CI-rollup van vóór de
      // rebase/force-push teruggeven (GitHub cachet die kort); één
      // wachtslag eerst verkleint die kans. Geen harde garantie: een
      // sha-vergelijking zou dit dichttimmeren maar valt buiten deze slice.
      await deps.delay(pollIntervalMs);
      while (true) {
        // NIT 9: bovenaan checken zodat een annulering tijdens de vorige
        // delay geen extra netwerk-refresh meer doet.
        if (deps.isCancelled()) {
          deps.onProgress(null);
          return {
            gemerged,
            gestopt: { reden: "geannuleerd", prNumber: current.number },
          };
        }
        const fresh = await deps.refreshPr(keyOf(current));
        if (fresh == null) {
          // BLOCKER 2: de PR is niet meer in de lijst te vinden. We kunnen
          // niet meer vaststellen of dat komt doordat hij inmiddels gemerged
          // is of doordat hij is gesloten/verwijderd; poll niet door op de
          // oude snapshot, maar stop expliciet zodat de gebruiker het ziet.
          deps.onProgress(null);
          return {
            gemerged,
            gestopt: { reden: "prVerdwenen", prNumber: current.number },
          };
        }
        current = fresh;
        // BLOCKER 2: "none" (geen checks ingesteld, of een lege rollup na
        // een force-push) telt als groen, consistent met mergeReasons() die
        // "none" ook niet als blokkerend behandelt.
        if (
          current.ciStatus.state === "success" ||
          current.ciStatus.state === "none"
        )
          break;
        if (current.ciStatus.state === "failure") {
          deps.onProgress(null);
          return {
            gemerged,
            gestopt: { reden: "rodeCi", prNumber: current.number },
          };
        }
        await deps.delay(pollIntervalMs);
      }
    }

    const stopReason = stopReasonFor(current);
    if (stopReason != null) {
      deps.onProgress(null);
      return {
        gemerged,
        gestopt: { reden: stopReason, prNumber: current.number },
      };
    }

    deps.onProgress({
      stap: i + 1,
      totaal: chain.length,
      bezig: "mergen",
      repoId: current.repoId,
      prNumber: current.number,
    });
    let result: "merged" | "rebase-conflict";
    try {
      result = await deps.mergeStep(current);
    } catch {
      // BLOCKER 1: een gooiende merge-call (403/netwerk/AuthError) mag de
      // lus niet als unhandled rejection kapot achterlaten.
      deps.onProgress(null);
      return {
        gemerged,
        gestopt: { reden: "mergeMislukt", prNumber: current.number },
      };
    }
    if (result === "rebase-conflict") {
      deps.onProgress(null);
      return {
        gemerged,
        gestopt: { reden: "rebaseMislukt", prNumber: current.number },
      };
    }
    gemerged.push(current.number);
  }

  deps.onProgress(null);
  return { gemerged };
}
