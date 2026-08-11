import { ReactieIcon } from "./icons";

const BAR_COUNT = 4;

/** <30, <150, <600, 600+ regels (additions + deletions). */
function sizeLevel(total: number): number {
  if (total < 30) return 1;
  if (total < 150) return 2;
  if (total < 600) return 3;
  return 4;
}

export function sizeWord(total: number): string {
  if (total < 30) return "klein";
  if (total < 150) return "middel";
  if (total < 600) return "groot";
  return "zeer groot";
}

interface RowMetricsProps {
  additions: number;
  deletions: number;
  comments: number;
}

/**
 * Vaste kolom van 52px: vier staafjes van 3px als omvangsklasse (exacte
 * +/- in de tooltip), en op regel 2 de reactieteller, verborgen bij nul.
 */
export function RowMetrics({
  additions,
  deletions,
  comments,
}: RowMetricsProps) {
  const total = additions + deletions;
  const level = sizeLevel(total);
  const sizeTitle = `${total} regels gewijzigd (${sizeWord(total)}): +${additions} −${deletions}`;

  return (
    <div className="row-metrics">
      <span className="row-metrics-bars" title={sizeTitle}>
        {Array.from({ length: BAR_COUNT }, (_, i) => (
          <span
            // biome-ignore lint/suspicious/noArrayIndexKey: vaste, niet-herordenende reeks van 4 staafjes
            key={i}
            className={i < level ? "row-metrics-bar on" : "row-metrics-bar off"}
          />
        ))}
      </span>
      {comments > 0 && (
        <span
          className="row-metrics-comments"
          title={`${comments} ${comments === 1 ? "reactie" : "reacties"} op deze PR`}
        >
          <ReactieIcon size={11} />
          <span className="mono">{comments}</span>
        </span>
      )}
    </div>
  );
}
