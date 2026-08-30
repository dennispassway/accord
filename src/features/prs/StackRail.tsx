import type { PrNumber, PullRequest } from "../../lib/github/domain";
import type { StackMergeProgress } from "../../lib/github/stackMerge";
import { computeStackInfo } from "../../lib/github/stacks";
import "./detail.css";
import { keyOfPr } from "./PrList";

const STACK_MERGE_BEZIG_LABEL: Record<StackMergeProgress["bezig"], string> = {
  mergen: "wordt gemerged",
  wachtenOpCi: "wacht op eigen CI",
  rebasen: "wordt gerebaset",
};

/** Status van de auto-rebase van de stapel na een merge, gericht op één
 * specifieke PR erin. `null` als er niets loopt. */
export interface StackRebaseStatus {
  prNumber: PrNumber;
  label: string;
  isError: boolean;
}

interface StackRailProps {
  pr: PullRequest;
  stackChain: PullRequest[];
  onSelectPr?: (key: string) => void;
  autoRebaseEnabled: boolean;
  onToggleAutoRebase: () => void;
  rebaseStatus?: StackRebaseStatus | null;
  /** Mag "Merge stapel in volgorde" op de onderste ongemergde PR van de keten. */
  canMergeStackInOrder: boolean;
  /** Voortgang van een lopende stapel-merge (deze specifieke PR of elders in
   * de keten), `null` als er niets loopt. */
  mergeProgress: StackMergeProgress | null;
  /** Bij welke PR de laatste stapel-merge stopte, met reden. */
  mergeStop: { prNumber: PrNumber; label: string } | null;
  onMergeStackInOrder: () => void;
  onCancelStackMergeInOrder: () => void;
}

/**
 * Kaart per PR in de stack, ingesprongen op diepte met een elleboog-connector.
 * `stackChain` is de hele stapel in mergevolgorde (zie buildStackChain), dus
 * ook de PR's ná de geselecteerde. Diepte en blockers komen uit
 * computeStackInfo over die keten zelf: een tak die splitst heeft twee PR's op
 * dezelfde diepte die niet op elkaar wachten.
 */
export function StackRail({
  pr,
  stackChain,
  onSelectPr = () => {},
  autoRebaseEnabled,
  onToggleAutoRebase,
  rebaseStatus,
  canMergeStackInOrder,
  mergeProgress,
  mergeStop,
  onMergeStackInOrder,
  onCancelStackMergeInOrder,
}: StackRailProps) {
  // BLOCKER 3: de keten krimpt tijdens een lopende stapel-merge (gemergde
  // PR's verdwijnen uit de lijst), maar de voortgang en de annuleerknop
  // moeten dan zichtbaar blijven; alleen zonder lopende run mag de rail
  // helemaal wegvallen bij een keten van 1 of 0.
  if (stackChain.length <= 1 && mergeProgress == null) return null;

  const infoByNumber = new Map(
    computeStackInfo(stackChain).map((info) => [info.number, info]),
  );
  const mergeRunning = mergeProgress != null;

  return (
    <div className="detail-stack">
      <div className="detail-stack-head">
        <span className="detail-label">Stapel</span>
        <span className="detail-stack-count mono">
          {stackChain.length} PR's, merge van boven naar onder
        </span>
      </div>
      <button
        type="button"
        className="detail-stack-autorebase"
        aria-pressed={autoRebaseEnabled}
        onClick={onToggleAutoRebase}
      >
        <span>Auto-rebase stapels</span>
        <span
          className={
            autoRebaseEnabled
              ? "detail-stack-autorebase-state on"
              : "detail-stack-autorebase-state"
          }
        >
          {autoRebaseEnabled ? "aan" : "uit"}
        </span>
      </button>
      <button
        type="button"
        className="detail-stack-merge-order"
        disabled={!canMergeStackInOrder || mergeRunning}
        onClick={onMergeStackInOrder}
      >
        Merge stapel in volgorde ({stackChain.length})
      </button>
      {mergeProgress != null && (
        <div className="detail-stack-merge-progress">
          <span>
            Stap {mergeProgress.stap} van {mergeProgress.totaal}:{" "}
            {STACK_MERGE_BEZIG_LABEL[mergeProgress.bezig]} #
            {mergeProgress.prNumber}
          </span>
          {/* BLOCKER 3: annuleren moet tijdens de hele run kunnen (mergen en
           * rebasen inbegrepen), niet alleen tijdens het wachten op CI: de
           * vlag wordt bij de eerstvolgende check in de lus gezien. */}
          <button
            type="button"
            className="detail-stack-merge-cancel"
            onClick={onCancelStackMergeInOrder}
          >
            Annuleren
          </button>
        </div>
      )}
      <div className="detail-stack-list">
        {stackChain.map((chainPr, index) => {
          const info = infoByNumber.get(chainPr.number);
          const blockers = info?.blockedByPrNumbers ?? [];
          const depth = (info?.stackPosition ?? 1) - 1;
          const ready = blockers.length === 0;
          // Volgorde: een lopende auto-rebase van deze kaart wint (meest
          // acute), dan de stapel-merge-voortgang/stop voor deze kaart, dan
          // de gewone klaar/wacht-notitie.
          const status =
            rebaseStatus?.prNumber === chainPr.number
              ? rebaseStatus
              : mergeStop?.prNumber === chainPr.number
                ? {
                    prNumber: chainPr.number,
                    label: mergeStop.label,
                    isError: true,
                  }
                : mergeProgress?.prNumber === chainPr.number
                  ? {
                      prNumber: chainPr.number,
                      label: `${STACK_MERGE_BEZIG_LABEL[mergeProgress.bezig]} (stap ${mergeProgress.stap}/${mergeProgress.totaal})`,
                      isError: false,
                    }
                  : null;
          return (
            <button
              type="button"
              key={chainPr.id}
              className={
                chainPr.number === pr.number
                  ? "detail-stack-card detail-stack-card-current"
                  : "detail-stack-card"
              }
              style={{ marginLeft: depth * 16 }}
              onClick={() => onSelectPr(keyOfPr(chainPr))}
            >
              {depth > 0 && <span className="detail-stack-elbow" />}
              <span className="detail-stack-order">{index + 1}</span>
              <span className="detail-stack-body">
                <span className="detail-stack-line1">
                  <span className="detail-stack-nr">#{chainPr.number}</span>
                  <span className="detail-stack-title">{chainPr.title}</span>
                </span>
                <span className="detail-stack-line2">
                  <span className="detail-stack-base">
                    op {chainPr.baseRef}
                  </span>
                  <span>·</span>
                  {status != null ? (
                    <span
                      className={
                        status.isError
                          ? "detail-stack-note-error"
                          : "detail-stack-note-rebasing"
                      }
                    >
                      {status.label}
                    </span>
                  ) : ready ? (
                    <span className="detail-stack-note-ready">
                      klaar om te mergen
                    </span>
                  ) : (
                    <span className="detail-stack-note-wait">
                      wacht op{" "}
                      {blockers.map((number) => `#${number}`).join(" en ")}
                    </span>
                  )}
                </span>
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
