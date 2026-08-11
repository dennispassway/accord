import { useEffect, useMemo, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { PrStackInfo } from "../../lib/github/stacks";
import { computeStackInfo } from "../../lib/github/stacks";
import { keyOfPr } from "./PrList";

/** Matcht op titel, repo-naam en nummer (case-insensitive, ook "#123"). */
function matchesSearch(pr: PullRequest, query: string): boolean {
  const q = query.trim().toLowerCase().replace(/^#/, "");
  if (q === "") return true;
  return (
    pr.title.toLowerCase().includes(q) ||
    pr.repoId.toLowerCase().includes(q) ||
    String(pr.number).includes(q)
  );
}

export interface SelectionState {
  keys: Set<string>;
  anchorKey: string | null;
  focusKey: string | null;
}

/**
 * Finder-semantiek voor multi-select: gewone klik vervangt de selectie,
 * cmd toggelt een enkele rij, shift selecteert het bereik vanaf de anchor
 * (en vervangt daarmee de huidige set). meta+shift telt als shift.
 */
export function applySelection(
  orderedKeys: string[],
  state: SelectionState,
  targetKey: string,
  mods: { meta: boolean; shift: boolean },
): SelectionState {
  if (mods.shift) {
    const anchorIndex =
      state.anchorKey != null ? orderedKeys.indexOf(state.anchorKey) : -1;
    const targetIndex = orderedKeys.indexOf(targetKey);
    if (anchorIndex < 0 || targetIndex < 0) {
      return {
        keys: new Set([targetKey]),
        anchorKey: targetKey,
        focusKey: targetKey,
      };
    }
    const [start, end] =
      anchorIndex <= targetIndex
        ? [anchorIndex, targetIndex]
        : [targetIndex, anchorIndex];
    const range = orderedKeys.slice(start, end + 1);
    return {
      keys: new Set(range),
      anchorKey: state.anchorKey,
      focusKey: targetKey,
    };
  }

  if (mods.meta) {
    const keys = new Set(state.keys);
    if (keys.has(targetKey)) {
      keys.delete(targetKey);
      const remaining = orderedKeys.filter((key) => keys.has(key));
      const focusKey =
        remaining.length > 0
          ? (remaining[remaining.length - 1] as string)
          : null;
      return { keys, anchorKey: state.anchorKey, focusKey };
    }
    keys.add(targetKey);
    return { keys, anchorKey: targetKey, focusKey: targetKey };
  }

  return {
    keys: new Set([targetKey]),
    anchorKey: targetKey,
    focusKey: targetKey,
  };
}

/**
 * De hele stapel waar `pr` in zit, root-first en per tak diep-eerst (dus de
 * mergevolgorde). Bevat ook de PR's ná `pr`, zodat het detailpaneel de stapel
 * toont bij elke PR erin, ook bij de eerste.
 */
export function buildStackChain(
  pr: PullRequest,
  stackInfo: PrStackInfo | undefined,
  prs: PullRequest[],
): PullRequest[] {
  const sameRepo = prs.filter((other) => other.repoId === pr.repoId);
  const ancestors = (stackInfo?.blockedByPrNumbers ?? [])
    .map((number) => sameRepo.find((other) => other.number === number))
    .filter((other): other is PullRequest => other != null);
  const root = ancestors[0] ?? pr;

  const chain: PullRequest[] = [];
  const seen = new Set<string>();
  const walk = (current: PullRequest) => {
    if (seen.has(current.headRef)) return;
    seen.add(current.headRef);
    chain.push(current);
    for (const child of sameRepo) {
      if (child.baseRef === current.headRef) walk(child);
    }
  };
  walk(root);
  return chain;
}

/**
 * Filtert de zichtbare PR's op de zoekopdracht, houdt een geldige (multi-)
 * selectie bij (valt terug op de eerste zichtbare PR) en berekent de
 * stack-chain voor het detailpaneel.
 */
export function usePrSelection(
  prs: PullRequest[],
  visiblePrs: PullRequest[],
  search: string,
) {
  const [selection, setSelection] = useState<SelectionState>({
    keys: new Set(),
    anchorKey: null,
    focusKey: null,
  });

  const filteredPrs = useMemo(
    () => visiblePrs.filter((pr) => matchesSearch(pr, search)),
    [visiblePrs, search],
  );
  const orderedKeys = useMemo(() => filteredPrs.map(keyOfPr), [filteredPrs]);
  const stackInfoByKey = useMemo(() => {
    const infos = computeStackInfo(prs);
    return new Map(
      infos.map((info) => [`${info.repoId}#${info.number}`, info]),
    );
  }, [prs]);

  const selectedIndex = filteredPrs.findIndex(
    (pr) => keyOfPr(pr) === selection.focusKey,
  );
  const selectedPr =
    selectedIndex >= 0 ? filteredPrs[selectedIndex] : undefined;

  // Keep a valid selection: pick the first visible PR when nothing (or a
  // now-filtered-out PR) is selected.
  useEffect(() => {
    if (selectedIndex < 0 && filteredPrs.length > 0) {
      const key = keyOfPr(filteredPrs[0] as PullRequest);
      setSelection({ keys: new Set([key]), anchorKey: key, focusKey: key });
    }
  }, [selectedIndex, filteredPrs]);

  // Snoei keys uit de multi-selectie die niet meer zichtbaar zijn.
  useEffect(() => {
    setSelection((current) => {
      const validKeys = new Set(orderedKeys);
      const pruned = new Set(
        [...current.keys].filter((key) => validKeys.has(key)),
      );
      if (pruned.size === current.keys.size) return current;
      return { ...current, keys: pruned };
    });
  }, [orderedKeys]);

  const stackInfo = selectedPr
    ? stackInfoByKey.get(keyOfPr(selectedPr))
    : undefined;
  const stackChain = useMemo(
    () => (selectedPr ? buildStackChain(selectedPr, stackInfo, prs) : []),
    [selectedPr, stackInfo, prs],
  );

  function setSelectedKey(key: string) {
    setSelection({ keys: new Set([key]), anchorKey: key, focusKey: key });
  }

  function select(key: string, mods: { meta: boolean; shift: boolean }) {
    setSelection((current) => applySelection(orderedKeys, current, key, mods));
  }

  function clearMultiSelection() {
    setSelection((current) => {
      const focus = current.focusKey;
      if (focus == null)
        return { keys: new Set(), anchorKey: null, focusKey: null };
      return { keys: new Set([focus]), anchorKey: focus, focusKey: focus };
    });
  }

  /** Pijltjes: verplaats de focus; met shift breidt het bereik vanaf de anchor uit. */
  function moveSelection(delta: number, extend = false) {
    if (filteredPrs.length === 0) return;
    const nextIndex = Math.min(
      Math.max(selectedIndex + delta, 0),
      filteredPrs.length - 1,
    );
    const next = filteredPrs[nextIndex];
    if (next) select(keyOfPr(next), { meta: false, shift: extend });
  }

  /** cmd+A: selecteer alle zichtbare PR's; focus en anchor blijven staan. */
  function selectAll() {
    if (orderedKeys.length === 0) return;
    setSelection((current) => ({
      keys: new Set(orderedKeys),
      anchorKey: current.anchorKey ?? (orderedKeys[0] as string),
      focusKey: current.focusKey ?? (orderedKeys[0] as string),
    }));
  }

  return {
    filteredPrs,
    selectedKey: selection.focusKey,
    selectedKeys: selection.keys,
    setSelectedKey,
    select,
    clearMultiSelection,
    selectAll,
    selectedPr,
    stackInfo,
    stackInfoByKey,
    stackChain,
    moveSelection,
  };
}
