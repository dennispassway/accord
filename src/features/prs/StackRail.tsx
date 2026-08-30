import type { PrNumber, PullRequest } from "../../lib/github/domain";
import { computeStackInfo } from "../../lib/github/stacks";
import "./detail.css";
import { keyOfPr } from "./PrList";

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
}: StackRailProps) {
  if (stackChain.length <= 1) return null;

  const infoByNumber = new Map(
    computeStackInfo(stackChain).map((info) => [info.number, info]),
  );

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
      <div className="detail-stack-list">
        {stackChain.map((chainPr, index) => {
          const info = infoByNumber.get(chainPr.number);
          const blockers = info?.blockedByPrNumbers ?? [];
          const depth = (info?.stackPosition ?? 1) - 1;
          const ready = blockers.length === 0;
          const status =
            rebaseStatus?.prNumber === chainPr.number ? rebaseStatus : null;
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
