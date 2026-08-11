import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import { computeStackInfo } from "../../lib/github/stacks";
import type { SelectionState } from "./usePrSelection";
import { applySelection, buildStackChain } from "./usePrSelection";

function pr(overrides: {
  number: number;
  baseRef: string;
  headRef: string;
  repoId?: string;
}): PullRequest {
  return {
    id: `id-${overrides.number}`,
    repoId: toRepoId(overrides.repoId ?? "acme/widgets"),
    title: `PR ${overrides.number}`,
    url: `https://github.com/acme/widgets/pull/${overrides.number}`,
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "none" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    priority: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 0,
    deletions: 0,
    comments: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: false,
    baseRef: overrides.baseRef,
    headRef: overrides.headRef,
    number: toPrNumber(overrides.number),
  };
}

function chainNumbers(target: PullRequest, prs: PullRequest[]): number[] {
  const infos = computeStackInfo(prs);
  const info = infos.find(
    (i) => i.repoId === target.repoId && i.number === target.number,
  );
  return buildStackChain(target, info, prs).map((p) => Number(p.number));
}

describe("buildStackChain", () => {
  const root = pr({ number: 1, baseRef: "main", headRef: "feat-a" });
  const middle = pr({ number: 2, baseRef: "feat-a", headRef: "feat-b" });
  const top = pr({ number: 3, baseRef: "feat-b", headRef: "feat-c" });
  const stack = [top, root, middle];

  it("toont de hele stapel bij de eerste PR", () => {
    expect(chainNumbers(root, stack)).toEqual([1, 2, 3]);
  });

  it("toont dezelfde stapel bij een PR halverwege", () => {
    expect(chainNumbers(middle, stack)).toEqual([1, 2, 3]);
  });

  it("laat een losse PR alleen", () => {
    const solo = pr({ number: 9, baseRef: "main", headRef: "feat-solo" });
    expect(chainNumbers(solo, [...stack, solo])).toEqual([9]);
  });

  it("volgt elke tak diep-eerst als de stapel splitst", () => {
    const sibling = pr({ number: 4, baseRef: "feat-a", headRef: "feat-d" });
    expect(chainNumbers(root, [...stack, sibling])).toEqual([1, 2, 3, 4]);
  });

  it("negeert PR's uit een andere repo met dezelfde branchnamen", () => {
    const other = pr({
      number: 7,
      baseRef: "feat-a",
      headRef: "feat-other",
      repoId: "acme/gadgets",
    });
    expect(chainNumbers(root, [...stack, other])).toEqual([1, 2, 3]);
  });

  it("loopt niet vast op een cyclus", () => {
    const a = pr({ number: 11, baseRef: "loop-b", headRef: "loop-a" });
    const b = pr({ number: 12, baseRef: "loop-a", headRef: "loop-b" });
    expect(chainNumbers(a, [a, b])).toEqual([11, 12]);
  });
});

describe("applySelection", () => {
  const orderedKeys = ["a", "b", "c", "d", "e"];
  const empty: SelectionState = {
    keys: new Set(),
    anchorKey: null,
    focusKey: null,
  };
  const noMods = { meta: false, shift: false };

  it("gewone klik vervangt de selectie", () => {
    const start: SelectionState = {
      keys: new Set(["a", "b"]),
      anchorKey: "a",
      focusKey: "b",
    };
    const result = applySelection(orderedKeys, start, "c", noMods);
    expect(result).toEqual({
      keys: new Set(["c"]),
      anchorKey: "c",
      focusKey: "c",
    });
  });

  it("cmd-toggle voegt toe en maakt de target anchor en focus", () => {
    const start: SelectionState = {
      keys: new Set(["a"]),
      anchorKey: "a",
      focusKey: "a",
    };
    const result = applySelection(orderedKeys, start, "c", {
      meta: true,
      shift: false,
    });
    expect(result).toEqual({
      keys: new Set(["a", "c"]),
      anchorKey: "c",
      focusKey: "c",
    });
  });

  it("cmd-toggle verwijdert en houdt de anchor, focus wordt de laatste overgebleven key", () => {
    const start: SelectionState = {
      keys: new Set(["a", "b", "c"]),
      anchorKey: "a",
      focusKey: "c",
    };
    const result = applySelection(orderedKeys, start, "b", {
      meta: true,
      shift: false,
    });
    expect(result).toEqual({
      keys: new Set(["a", "c"]),
      anchorKey: "a",
      focusKey: "c",
    });
  });

  it("cmd-toggle van de laatste key laat een lege set en focus null achter", () => {
    const start: SelectionState = {
      keys: new Set(["a"]),
      anchorKey: "a",
      focusKey: "a",
    };
    const result = applySelection(orderedKeys, start, "a", {
      meta: true,
      shift: false,
    });
    expect(result).toEqual({ keys: new Set(), anchorKey: "a", focusKey: null });
  });

  it("shift selecteert het bereik omlaag vanaf de anchor", () => {
    const start: SelectionState = {
      keys: new Set(["b"]),
      anchorKey: "b",
      focusKey: "b",
    };
    const result = applySelection(orderedKeys, start, "d", {
      meta: false,
      shift: true,
    });
    expect(result).toEqual({
      keys: new Set(["b", "c", "d"]),
      anchorKey: "b",
      focusKey: "d",
    });
  });

  it("shift selecteert het bereik omhoog vanaf de anchor", () => {
    const start: SelectionState = {
      keys: new Set(["d"]),
      anchorKey: "d",
      focusKey: "d",
    };
    const result = applySelection(orderedKeys, start, "b", {
      meta: false,
      shift: true,
    });
    expect(result).toEqual({
      keys: new Set(["b", "c", "d"]),
      anchorKey: "d",
      focusKey: "b",
    });
  });

  it("shift na cmd-toggle vervangt de set met het bereik vanaf de anchor", () => {
    const start: SelectionState = {
      keys: new Set(["a", "c"]),
      anchorKey: "a",
      focusKey: "c",
    };
    const result = applySelection(orderedKeys, start, "e", {
      meta: true,
      shift: true,
    });
    expect(result).toEqual({
      keys: new Set(["a", "b", "c", "d", "e"]),
      anchorKey: "a",
      focusKey: "e",
    });
  });

  it("shift zonder anchor gedraagt zich als een gewone klik", () => {
    const result = applySelection(orderedKeys, empty, "c", {
      meta: false,
      shift: true,
    });
    expect(result).toEqual({
      keys: new Set(["c"]),
      anchorKey: "c",
      focusKey: "c",
    });
  });
});
