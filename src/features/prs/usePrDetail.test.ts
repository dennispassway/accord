import { describe, expect, it } from "vitest";
import type { PrDetail } from "../../lib/github/prDetail";
import {
  MOCK_PR_DETAIL_FALLBACK,
  MOCK_PR_DETAILS,
} from "../../lib/mock/detailFixtures";
import { detailFromCache, mockDetailState } from "./usePrDetail";

describe("mockDetailState", () => {
  it("geeft de fixture terug voor een bekende PR", () => {
    const known = "acme/knowledge-base#167";
    expect(mockDetailState(known, false)).toEqual({
      status: "ready",
      detail: MOCK_PR_DETAILS[known],
      error: null,
    });
  });

  it("valt terug op de fallback-fixture voor een onbekende PR", () => {
    expect(mockDetailState("onbekend/repo#1", false)).toEqual({
      status: "ready",
      detail: MOCK_PR_DETAIL_FALLBACK,
      error: null,
    });
  });

  it("het QA-foutpad wint altijd, ook op een bekende PR", () => {
    const result = mockDetailState("acme/knowledge-base#167", true);
    expect(result.status).toBe("error");
    expect(result.detail).toBeNull();
    expect(result.error).not.toBeNull();
  });
});

describe("detailFromCache", () => {
  it("geeft null als de prKey nog niet in de cache staat, geen tweede fetch nodig zonder deze check", () => {
    const cache = new Map<string, PrDetail>();
    expect(detailFromCache(cache, "acme/widgets#1")).toBeNull();
  });

  it("geeft een ready-state met de gecachte detail bij een cache-hit", () => {
    const cache = new Map<string, PrDetail>();
    cache.set("acme/widgets#1", MOCK_PR_DETAIL_FALLBACK);
    expect(detailFromCache(cache, "acme/widgets#1")).toEqual({
      status: "ready",
      detail: MOCK_PR_DETAIL_FALLBACK,
      error: null,
    });
  });
});
