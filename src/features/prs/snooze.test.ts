import { describe, expect, it } from "vitest";
import type { PullRequest } from "../../lib/github/domain";
import { toPrNumber, toRepoId } from "../../lib/github/domain";
import {
  fromAmsterdamLocal,
  isPastOrNow,
  isSnoozed,
  loadSnoozes,
  nextMondayAt9,
  pruneSnoozes,
  type SnoozeEntry,
  saveSnoozes,
  toAmsterdamLocal,
  tomorrowAt9,
} from "./snooze";

function pr(overrides: Partial<PullRequest> = {}): PullRequest {
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
    mergeStateStatus: "CLEAN",
    createdAt: "2026-07-01T09:00:00Z",
    updatedAt: "2026-07-01T09:00:00Z",
    additions: 3,
    deletions: 1,
    comments: 0,
    openThreads: 0,
    reviewers: [],
    agentReviews: [],
    assignees: [],
    reviewRequestedFromMe: false,
    assignedToMe: false,
    authoredByMe: true,
    ...overrides,
  };
}

function fakeStorage() {
  const data = new Map<string, string>();
  return {
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => {
      data.set(key, value);
    },
  };
}

describe("isSnoozed", () => {
  const entry: SnoozeEntry = {
    until: "2026-08-02T07:00:00.000Z",
    updatedAt: "2026-07-01T09:00:00Z",
    sectionKey: "actie",
  };

  it("is snoozed vóór het until-moment, met dezelfde updatedAt en sectie", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(isSnoozed(entry, pr(), "actie", now)).toBe(true);
  });

  it("is niet meer snoozed zodra now >= until", () => {
    const now = new Date("2026-08-02T07:00:00.000Z");
    expect(isSnoozed(entry, pr(), "actie", now)).toBe(false);
  });

  it("is niet meer snoozed bij activiteit (andere updatedAt)", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(
      isSnoozed(entry, pr({ updatedAt: "2026-07-05T09:00:00Z" }), "actie", now),
    ).toBe(false);
  });

  it("is niet meer snoozed als de sectie is veranderd", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(isSnoozed(entry, pr(), "klaar", now)).toBe(false);
  });

  it("blijft snoozed bij een tijdelijke uitstap naar 'wachten' (bv. mergeable UNKNOWN na een merge op main)", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(isSnoozed(entry, pr(), "wachten", now)).toBe(true);
  });

  it("blijft snoozed bij een tijdelijke uitstap naar 'agent' (bv. een agent-run)", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(isSnoozed(entry, pr(), "agent", now)).toBe(true);
  });

  it("blijft snoozed als de PR al in 'wachten' zat toen hij gesnoozed werd en terugkomt in een andere sectie", () => {
    const wachtenEntry: SnoozeEntry = {
      ...entry,
      sectionKey: "wachten",
    };
    const now = new Date("2026-08-01T00:00:00.000Z");
    expect(isSnoozed(wachtenEntry, pr(), "actie", now)).toBe(true);
  });
});

describe("pruneSnoozes", () => {
  it("verwijdert entries die niet meer snoozed zijn en entries zonder PR in de lijst", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const stillSnoozed = pr({ number: toPrNumber(1) });
    const expired = pr({ number: toPrNumber(2) });
    const store = {
      "acme/widgets#1": {
        until: "2026-09-01T00:00:00.000Z",
        updatedAt: stillSnoozed.updatedAt,
        sectionKey: "actie" as const,
      },
      "acme/widgets#2": {
        until: "2026-07-01T00:00:00.000Z",
        updatedAt: expired.updatedAt,
        sectionKey: "actie" as const,
      },
      "acme/widgets#99": {
        until: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-07-01T09:00:00Z",
        sectionKey: "actie" as const,
      },
    };
    const pruned = pruneSnoozes(
      store,
      [stillSnoozed, expired],
      () => "actie" as const,
      now,
    );
    expect(Object.keys(pruned)).toEqual(["acme/widgets#1"]);
  });

  it("laat een entry staan die tijdelijk in 'wachten' terechtkomt (geen echte wake-up)", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const stillSnoozed = pr({ number: toPrNumber(1) });
    const store = {
      "acme/widgets#1": {
        until: "2026-09-01T00:00:00.000Z",
        updatedAt: stillSnoozed.updatedAt,
        sectionKey: "actie" as const,
      },
    };
    const pruned = pruneSnoozes(store, [stillSnoozed], () => "wachten", now);
    expect(Object.keys(pruned)).toEqual(["acme/widgets#1"]);
  });

  it("verwijdert een entry na een echte sectiewisseling (niet naar wachten of agent)", () => {
    const now = new Date("2026-08-01T00:00:00.000Z");
    const wokenUp = pr({ number: toPrNumber(1) });
    const store = {
      "acme/widgets#1": {
        until: "2026-09-01T00:00:00.000Z",
        updatedAt: wokenUp.updatedAt,
        sectionKey: "actie" as const,
      },
    };
    const pruned = pruneSnoozes(store, [wokenUp], () => "klaar", now);
    expect(Object.keys(pruned)).toEqual([]);
  });
});

describe("localStorage-opslag", () => {
  it("bewaart en laadt, en negeert corrupte entries", () => {
    const storage = fakeStorage();
    saveSnoozes(
      {
        "acme/widgets#1": {
          until: "2026-09-01T00:00:00.000Z",
          updatedAt: "2026-07-01T09:00:00Z",
          sectionKey: "actie",
        },
      },
      storage,
    );
    expect(loadSnoozes(storage)).toEqual({
      "acme/widgets#1": {
        until: "2026-09-01T00:00:00.000Z",
        updatedAt: "2026-07-01T09:00:00Z",
        sectionKey: "actie",
      },
    });
  });

  it("valt terug op een lege store bij corrupte JSON", () => {
    const storage = fakeStorage();
    storage.setItem("pr-cockpit.snoozes", "{niet-geldig");
    expect(loadSnoozes(storage)).toEqual({});
  });

  it("laat een entry zonder geldige until/sectionKey vallen", () => {
    const storage = fakeStorage();
    storage.setItem(
      "pr-cockpit.snoozes",
      JSON.stringify({
        "acme/widgets#1": { until: 123, updatedAt: "x", sectionKey: "actie" },
        "acme/widgets#2": {
          until: "2026-09-01T00:00:00.000Z",
          updatedAt: "x",
          sectionKey: "niet-bestaand",
        },
        "acme/widgets#3": {
          until: "2026-09-01T00:00:00.000Z",
          updatedAt: "x",
          sectionKey: "actie",
        },
      }),
    );
    expect(loadSnoozes(storage)).toEqual({
      "acme/widgets#3": {
        until: "2026-09-01T00:00:00.000Z",
        updatedAt: "x",
        sectionKey: "actie",
      },
    });
  });
});

describe("tomorrowAt9", () => {
  it("geeft morgen 09:00 Amsterdam-tijd terug (zomertijd, UTC+2)", () => {
    const now = new Date("2026-08-01T20:00:00.000Z");
    expect(tomorrowAt9(now).toISOString()).toBe("2026-08-02T07:00:00.000Z");
  });

  it("klopt rond de overgang naar wintertijd (25 okt 2026)", () => {
    const now = new Date("2026-10-24T20:00:00.000Z");
    // 25 okt 2026 is de dag van de overgang zelf (om 01:00 UTC gaat de klok
    // terug naar wintertijd, UTC+1); 09:00 lokaal die dag is dus al wintertijd.
    expect(tomorrowAt9(now).toISOString()).toBe("2026-10-25T08:00:00.000Z");
  });

  it("klopt rond de overgang naar zomertijd (29 maart 2026)", () => {
    const now = new Date("2026-03-28T20:00:00.000Z");
    // 29 maart 2026 is al zomertijd (UTC+2); de overgang gaat in om 02:00
    // lokale tijd in de nacht van 28 op 29 maart.
    expect(tomorrowAt9(now).toISOString()).toBe("2026-03-29T07:00:00.000Z");
  });
});

describe("nextMondayAt9", () => {
  it("geeft de eerstvolgende maandag 09:00 als het nu geen maandag is", () => {
    // 2026-08-01 is een zaterdag.
    const now = new Date("2026-08-01T20:00:00.000Z");
    expect(nextMondayAt9(now).toISOString()).toBe("2026-08-03T07:00:00.000Z");
  });

  it("is het vandaag maandag, dan de maandag daarna (7 dagen verder)", () => {
    // 2026-08-03 is een maandag.
    const now = new Date("2026-08-03T08:00:00.000Z");
    expect(nextMondayAt9(now).toISOString()).toBe("2026-08-10T07:00:00.000Z");
  });
});

describe("fromAmsterdamLocal", () => {
  it("interpreteert een datetime-local waarde als Amsterdamse tijd (zomertijd)", () => {
    expect(fromAmsterdamLocal("2026-08-02T14:00").toISOString()).toBe(
      "2026-08-02T12:00:00.000Z",
    );
  });

  it("interpreteert een datetime-local waarde in wintertijd", () => {
    expect(fromAmsterdamLocal("2026-01-15T14:00").toISOString()).toBe(
      "2026-01-15T13:00:00.000Z",
    );
  });
});

describe("toAmsterdamLocal", () => {
  it("is het omgekeerde van fromAmsterdamLocal (zomertijd)", () => {
    expect(toAmsterdamLocal(new Date("2026-08-02T12:00:00.000Z"))).toBe(
      "2026-08-02T14:00",
    );
  });

  it("is het omgekeerde van fromAmsterdamLocal (wintertijd)", () => {
    expect(toAmsterdamLocal(new Date("2026-01-15T13:00:00.000Z"))).toBe(
      "2026-01-15T14:00",
    );
  });
});

describe("isPastOrNow", () => {
  const now = new Date("2026-08-01T12:00:00.000Z");

  it("is waar voor een leeg veld", () => {
    expect(isPastOrNow("", now)).toBe(true);
  });

  it("is waar voor een ongeldige waarde", () => {
    expect(isPastOrNow("niet-geldig", now)).toBe(true);
  });

  it("is waar voor een moment in het verleden", () => {
    expect(
      isPastOrNow(toAmsterdamLocal(new Date("2026-08-01T11:00:00.000Z")), now),
    ).toBe(true);
  });

  it("is waar voor exact nu", () => {
    expect(isPastOrNow(toAmsterdamLocal(now), now)).toBe(true);
  });

  it("is onwaar voor een moment in de toekomst", () => {
    expect(
      isPastOrNow(toAmsterdamLocal(new Date("2026-08-01T13:00:00.000Z")), now),
    ).toBe(false);
  });
});
