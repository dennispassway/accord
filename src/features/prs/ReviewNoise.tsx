import { useMemo, useSyncExternalStore } from "react";
import type { PullRequest } from "../../lib/github/domain";
import {
  type NoiseCounts,
  noiseSnapshot,
  parseNoise,
  prNoise,
  repoNoise,
  subscribeNoise,
} from "../../lib/reviewNoise";

const NOTE =
  "Benadering: weerlegd betekent resolved zonder dat de regel veranderde. Een fix elders in de PR telt dus ook als weerlegd. Maximaal 100 threads per PR.";

function total({ gefixt, weerlegd, open }: NoiseCounts): number {
  return gefixt + weerlegd + open;
}

/** Hoeveel van de agent-bevindingen gefixt, weerlegd of nog open zijn, voor
 * deze PR en voor de hele repo. Leest alleen uit lokale opslag: de inspector
 * schrijft de cijfers zodra hij de PR-detail heeft, dus de sectie verschijnt
 * pas na het openen van de inspector. */
export function ReviewNoise({ pr }: { pr: PullRequest }) {
  const snapshot = useSyncExternalStore(subscribeNoise, noiseSnapshot);
  const all = useMemo(() => parseNoise(snapshot), [snapshot]);
  const counts = prNoise(pr.repoId, pr.number, all);
  if (counts == null || total(counts) === 0) return null;

  const repo = repoNoise(pr.repoId, all);
  const percentage = Math.round(
    (repo.counts.gefixt / total(repo.counts)) * 100,
  );

  return (
    <div className="detail-card detail-noise" title={NOTE}>
      <p className="detail-noise-line">
        <span className="detail-label">Agent-bevindingen</span> {counts.gefixt}{" "}
        gefixt · {counts.weerlegd} weerlegd · {counts.open} open
      </p>
      <p className="detail-noise-repo">
        In deze repo: {percentage}% gefixt over {repo.prs}{" "}
        {repo.prs === 1 ? "PR" : "PR's"}
      </p>
      <p className="detail-noise-note">{NOTE}</p>
    </div>
  );
}
