import type { PrNumber, RepoId } from "../../lib/github/domain";
import "./detail.css";

interface PrioritySegmentedProps {
  repoId: RepoId;
  prNumber: PrNumber;
  priority: 1 | 2 | null;
  onSetPriority: (
    repoId: RepoId,
    prNumber: PrNumber,
    priority: 1 | 2 | null,
  ) => void;
  /** Reden van een mislukte prioriteits-write voor deze PR; de lijst blijft
   * intact, de fout verschijnt eronder (optimistisch schrijven, rollback bij
   * fout). */
  error?: string | null;
}

/** Prioriteit als spoor van 28px met drie segmenten: P1 / P2 / Geen. */
export function PrioritySegmented({
  repoId,
  prNumber,
  priority,
  onSetPriority,
  error,
}: PrioritySegmentedProps) {
  return (
    <div className="detail-priority">
      <span className="detail-label">Prioriteit</span>
      <div className="detail-priority-track">
        <button
          type="button"
          className={
            priority === 1
              ? "detail-priority-segment detail-priority-segment-active"
              : "detail-priority-segment"
          }
          onClick={() =>
            onSetPriority(repoId, prNumber, priority === 1 ? null : 1)
          }
        >
          P1
        </button>
        <button
          type="button"
          className={
            priority === 2
              ? "detail-priority-segment detail-priority-segment-active"
              : "detail-priority-segment"
          }
          onClick={() =>
            onSetPriority(repoId, prNumber, priority === 2 ? null : 2)
          }
        >
          P2
        </button>
        <button
          type="button"
          className={
            priority == null
              ? "detail-priority-segment detail-priority-segment-active"
              : "detail-priority-segment"
          }
          onClick={() => onSetPriority(repoId, prNumber, null)}
        >
          Geen
        </button>
      </div>
      {error != null && <p className="detail-priority-error">{error}</p>}
    </div>
  );
}
