import { useCallback, useMemo, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import { matchesPerson, type PersonFilter, peopleFor } from "./personFilter";

/**
 * Het persoonfilter op de al repo-gefilterde PR's. Bewust niet bewaard over
 * een herstart: een vergeten filter verbergt PR's zonder dat je het merkt.
 */
export function usePersonFilter(scopedPrs: PullRequest[], me: string) {
  const [filter, setFilter] = useState<PersonFilter>({
    role: "author",
    login: null,
  });
  const filteredPrs = useMemo(
    () => scopedPrs.filter((pr) => matchesPerson(pr, filter, me)),
    [scopedPrs, filter, me],
  );
  const people = useMemo(
    () => peopleFor(scopedPrs, filter.role, me, filter.login),
    [scopedPrs, filter, me],
  );
  /** Zet het filter op "Iedereen" als het `pr` verbergt, anders valt een
   * selectie van buitenaf stil terug op de eerste zichtbare PR. */
  const reveal = useCallback(
    (pr: PullRequest) => {
      setFilter((current) =>
        matchesPerson(pr, current, me) ? current : { ...current, login: null },
      );
    },
    [me],
  );
  return { filter, setFilter, filteredPrs, people, reveal };
}
