import { describe, expect, it } from "vitest";
import { decideNotification, type NotificationEvent } from "./notifications";

const FOCUSED = { enabled: true, windowFocused: true };
const UNFOCUSED = { enabled: true, windowFocused: false };

const RUN_DONE: NotificationEvent = {
  type: "runFinished",
  agent: "claude",
  prKey: "acme/storefront#594",
  prNumber: 594,
  status: "done",
  commentCount: 2,
  commitCount: 1,
};

describe("decideNotification: gates", () => {
  it("geeft null als het venster gefocust is", () => {
    expect(decideNotification(RUN_DONE, FOCUSED)).toBeNull();
  });

  it("geeft null als de instelling uit staat, ook zonder focus", () => {
    expect(
      decideNotification(RUN_DONE, { enabled: false, windowFocused: false }),
    ).toBeNull();
  });

  it("meldt wel zodra de instelling aan staat en het venster niet gefocust is", () => {
    expect(decideNotification(RUN_DONE, UNFOCUSED)).not.toBeNull();
  });
});

describe("decideNotification: runFinished", () => {
  it("bouwt titel en body met aantallen (meervoud) bij een geslaagde run", () => {
    expect(decideNotification(RUN_DONE, UNFOCUSED)).toEqual({
      title: "Claude is klaar met #594",
      body: "2 opmerkingen, 1 fix-commit",
      prKey: "acme/storefront#594",
    });
  });

  it("gebruikt enkelvoud bij precies 1 opmerking en 1 fix-commit", () => {
    const event: NotificationEvent = {
      ...RUN_DONE,
      commentCount: 1,
      commitCount: 1,
    };
    expect(decideNotification(event, UNFOCUSED)?.body).toBe(
      "1 opmerking, 1 fix-commit",
    );
  });

  it("gebruikt meervoud bij 0 en bij meerdere", () => {
    const event: NotificationEvent = {
      ...RUN_DONE,
      commentCount: 0,
      commitCount: 3,
    };
    expect(decideNotification(event, UNFOCUSED)?.body).toBe(
      "0 opmerkingen, 3 fix-commits",
    );
  });

  it("laat de aantallen weg als ze niet bekend zijn (alleen agent + PR-nummer)", () => {
    const event: NotificationEvent = {
      type: "runFinished",
      agent: "codex",
      prKey: "acme/jobs-api#12",
      prNumber: 12,
      status: "done",
    };
    expect(decideNotification(event, UNFOCUSED)).toEqual({
      title: "Codex is klaar met #12",
      body: "",
      prKey: "acme/jobs-api#12",
    });
  });

  it("toont een aparte tekst bij een gefaalde run, zonder aantallen", () => {
    const event: NotificationEvent = {
      type: "runFinished",
      agent: "claude",
      prKey: "acme/storefront#594",
      prNumber: 594,
      status: "failed",
      commentCount: 2,
      commitCount: 1,
    };
    expect(decideNotification(event, UNFOCUSED)).toEqual({
      title: "Claude is mislukt op #594",
      body: "",
      prKey: "acme/storefront#594",
    });
  });
});

describe("decideNotification: ciFlippedRed", () => {
  it("meldt de PR en de repo als de CI naar rood omslaat", () => {
    const event: NotificationEvent = {
      type: "ciFlippedRed",
      prKey: "acme/storefront#88",
      prNumber: 88,
      repoName: "acme/storefront",
    };
    expect(decideNotification(event, UNFOCUSED)).toEqual({
      title: "CI faalt op #88",
      body: "acme/storefront",
      prKey: "acme/storefront#88",
    });
  });
});

describe("decideNotification: mergeCompleted", () => {
  it("meldt een voltooide merge met de repo als body", () => {
    const event: NotificationEvent = {
      type: "mergeCompleted",
      prKey: "acme/jobs-api#41",
      prNumber: 41,
      repoName: "acme/jobs-api",
    };
    expect(decideNotification(event, UNFOCUSED)).toEqual({
      title: "#41 gemerged",
      body: "acme/jobs-api",
      prKey: "acme/jobs-api#41",
    });
  });
});
