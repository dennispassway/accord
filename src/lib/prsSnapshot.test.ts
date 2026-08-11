import { beforeEach, describe, expect, it } from "vitest";
import type { PullRequest } from "./github/domain";
import { toPrNumber, toRepoId } from "./github/domain";
import type { SnapshotStorage } from "./prsSnapshot";
import {
  clearPrsSnapshot,
  loadPrsSnapshot,
  savePrsSnapshot,
} from "./prsSnapshot";

function fakeStorage(): SnapshotStorage {
  const data = new Map<string, string>();
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value);
    },
    removeItem: (key) => {
      data.delete(key);
    },
  };
}

function pr(): PullRequest {
  return {
    id: "PR_kwABC",
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(42),
    title: "Add feature",
    url: "https://github.com/acme/widgets/pull/42",
    headRef: "feature/x",
    baseRef: "main",
    author: { kind: "human", login: "dennis" },
    ciStatus: { state: "success" },
    reviewState: { state: "none" },
    isDraft: false,
    mergeable: "MERGEABLE",
    priority: null,
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 3,
    deletions: 1,
    comments: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: true,
  };
}

describe("prsSnapshot", () => {
  let storage: SnapshotStorage;

  beforeEach(() => {
    storage = fakeStorage();
  });

  it("geeft null als er nog geen snapshot is opgeslagen", () => {
    expect(loadPrsSnapshot(storage)).toBeNull();
  });

  it("bewaart en laadt een snapshot", () => {
    savePrsSnapshot(
      {
        prs: [pr()],
        viewerLogin: "dennis",
        lastUpdated: "2026-08-02T10:00:00.000Z",
      },
      storage,
    );

    expect(loadPrsSnapshot(storage)).toEqual({
      prs: [pr()],
      viewerLogin: "dennis",
      lastUpdated: "2026-08-02T10:00:00.000Z",
    });
  });

  it("valt terug op null bij corrupte JSON", () => {
    storage.setItem("pr-cockpit.prsSnapshot", "{niet-geldig-json");
    expect(loadPrsSnapshot(storage)).toBeNull();
  });

  it("valt terug op null als het prs-veld ontbreekt of geen array is", () => {
    storage.setItem(
      "pr-cockpit.prsSnapshot",
      JSON.stringify({ viewerLogin: "dennis" }),
    );
    expect(loadPrsSnapshot(storage)).toBeNull();
  });

  it("valt terug op null als getItem throwt (bv. afgesloten storage)", () => {
    const throwing: SnapshotStorage = {
      getItem: () => {
        throw new Error("storage disabled");
      },
      setItem: () => {},
    };
    expect(loadPrsSnapshot(throwing)).toBeNull();
  });

  it("slikt een throwende setItem stil (bv. quota vol)", () => {
    const throwing: SnapshotStorage = {
      getItem: () => null,
      setItem: () => {
        throw new Error("quota exceeded");
      },
    };
    expect(() =>
      savePrsSnapshot(
        {
          prs: [pr()],
          viewerLogin: "dennis",
          lastUpdated: "2026-08-02T10:00:00.000Z",
        },
        throwing,
      ),
    ).not.toThrow();
  });

  it("wist een bewaarde snapshot", () => {
    savePrsSnapshot(
      {
        prs: [pr()],
        viewerLogin: "dennis",
        lastUpdated: "2026-08-02T10:00:00.000Z",
      },
      storage,
    );
    clearPrsSnapshot(storage);
    expect(loadPrsSnapshot(storage)).toBeNull();
  });

  it("slikt een throwende removeItem stil", () => {
    const throwing: SnapshotStorage = {
      getItem: () => null,
      setItem: () => {},
      removeItem: () => {
        throw new Error("storage disabled");
      },
    };
    expect(() => clearPrsSnapshot(throwing)).not.toThrow();
  });
});
