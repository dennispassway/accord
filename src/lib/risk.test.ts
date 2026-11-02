import { describe, expect, it } from "vitest";
import { type PullRequest, toPrNumber, toRepoId } from "./github/domain";
import {
  DEFAULT_HIGH_RISK_PATTERNS,
  MAX_FILES,
  matchesGlob,
  overrideKey,
  patternsForRepo,
  riskGate,
  riskTier,
} from "./risk";

const files = (paths: string[], count = paths.length) => ({
  changedPaths: paths,
  changedFileCount: count,
});

describe("matchesGlob", () => {
  it("laat ** nul mappen overslaan", () => {
    expect(matchesGlob("**/auth.*", "auth.rs")).toBe(true);
    expect(matchesGlob("**/auth.*", "src-tauri/src/auth.rs")).toBe(true);
    expect(matchesGlob("**/auth/**", "auth/login.ts")).toBe(true);
    expect(matchesGlob("**/auth/**", "a/b/auth/x/y.ts")).toBe(true);
  });

  it("laat * niet over een / heen", () => {
    expect(matchesGlob("src/*.ts", "src/a.ts")).toBe(true);
    expect(matchesGlob("src/*.ts", "src/deep/a.ts")).toBe(false);
  });

  it("laat ? precies een teken matchen, niet de /", () => {
    expect(matchesGlob("a?.ts", "ab.ts")).toBe(true);
    expect(matchesGlob("a?.ts", "abc.ts")).toBe(false);
    expect(matchesGlob("a?b", "a/b")).toBe(false);
  });

  it("is hoofdletterongevoelig", () => {
    expect(matchesGlob("**/Dockerfile*", "build/dockerfile.prod")).toBe(true);
    expect(matchesGlob("src/auth/**", "SRC/Auth/Login.ts")).toBe(true);
  });

  it("escapet regex-tekens in het patroon", () => {
    expect(matchesGlob("a.b", "a.b")).toBe(true);
    expect(matchesGlob("a.b", "axb")).toBe(false);
    expect(matchesGlob("a+(b)[c]$^|{d}", "a+(b)[c]$^|{d}")).toBe(true);
  });

  it("matcht het hele pad, niet een deel", () => {
    expect(matchesGlob("auth", "src/auth")).toBe(false);
    expect(matchesGlob("src", "src/auth")).toBe(false);
  });
});

describe("DEFAULT_HIGH_RISK_PATTERNS", () => {
  const tier = (path: string) =>
    riskTier(files([path]), DEFAULT_HIGH_RISK_PATTERNS).tier;

  it.each([
    "src-tauri/src/auth.rs",
    "db/migrations/001.sql",
    ".github/workflows/ci.yml",
    "src/session/store.ts",
    "api/payments/charge.ts",
    "api/payment.service.ts",
    "web/checkout/page.tsx",
    "billing.py",
    "infra/Dockerfile.prod",
    "src/middleware/authentication.ts",
    "src/lib/auth-helpers.ts",
    "src/oauth/callback.ts",
    "src/authz/policy.ts",
    "src/lib/session.ts",
    "src/sessions/store.ts",
    "db/migrate/001.rb",
  ])("%s is hoog", (path) => {
    expect(tier(path)).toBe("hoog");
  });

  it.each([
    "src/features/author/Author.tsx",
    "src/lib/authorName.ts",
    "README.md",
    "src/lib/github/queries.ts",
  ])("%s is normaal", (path) => {
    expect(tier(path)).toBe("normaal");
  });
});

describe("riskTier", () => {
  it("noemt maximaal 3 gematchte paden en telt de rest", () => {
    const paths = [1, 2, 3, 4, 5].map((n) => `db/migrations/00${n}.sql`);
    const result = riskTier(files(paths), DEFAULT_HIGH_RISK_PATTERNS);
    expect(result.tier).toBe("hoog");
    expect(result.reasons).toEqual([
      "db/migrations/001.sql",
      "db/migrations/002.sql",
      "db/migrations/003.sql",
      "+2",
    ]);
  });

  it("noemt het maximum als er meer bestanden zijn dan MAX_FILES", () => {
    const result = riskTier(files(["a.ts"], MAX_FILES + 1), []);
    expect(result).toEqual({
      tier: "hoog",
      reasons: [`meer dan ${MAX_FILES} bestanden`],
    });
  });

  it("zegt dat niet alle bestanden bekend zijn bij minder paden dan bestanden onder het maximum", () => {
    expect(riskTier(files(["a.ts"], 2), [])).toEqual({
      tier: "hoog",
      reasons: ["niet alle bestanden bekend"],
    });
  });

  it("is normaal bij precies MAX_FILES volledig bekeken bestanden", () => {
    const paths = Array.from({ length: MAX_FILES }, (_, i) => `f${i}.ts`);
    expect(riskTier(files(paths), []).tier).toBe("normaal");
  });

  it("is normaal zonder gematchte paden", () => {
    expect(riskTier(files(["a.ts"]), DEFAULT_HIGH_RISK_PATTERNS)).toEqual({
      tier: "normaal",
      reasons: [],
    });
  });
});

describe("patternsForRepo", () => {
  const repo = toRepoId("acme/widgets");

  it("valt zonder of met een lege lijst terug op de defaults", () => {
    expect(patternsForRepo(repo, {})).toBe(DEFAULT_HIGH_RISK_PATTERNS);
    expect(patternsForRepo(repo, { "acme/widgets": [] })).toBe(
      DEFAULT_HIGH_RISK_PATTERNS,
    );
  });

  it("vervangt de defaults door de lijst van die repo, niet van een andere", () => {
    const stored = { "acme/widgets": ["src/**"], "acme/other": ["x/**"] };
    expect(patternsForRepo(repo, stored)).toEqual(["src/**"]);
    const patterns = patternsForRepo(repo, stored);
    expect(riskTier(files(["src/a.ts"]), patterns).tier).toBe("hoog");
    expect(riskTier(files(["src-tauri/src/auth.rs"]), patterns).tier).toBe(
      "normaal",
    );
  });
});

function pr(overrides: Partial<PullRequest> = {}) {
  return {
    repoId: toRepoId("acme/widgets"),
    number: toPrNumber(7),
    headOid: "abc1234",
    authoredByMe: true,
    humanApprovedHead: false,
    ...files(["db/migrations/001.sql"]),
    ...overrides,
  };
}

describe("riskGate", () => {
  const none = new Set<string>();

  it("vraagt een menselijke review bij hoog risico zonder approval of override", () => {
    const gate = riskGate(pr(), DEFAULT_HIGH_RISK_PATTERNS, none);
    expect(gate.tier).toBe("hoog");
    expect(gate.needsHumanReview).toBe(true);
    expect(gate.reasons).toEqual(["db/migrations/001.sql"]);
  });

  it("heeft geen review nodig met een menselijke approval op de head", () => {
    const gate = riskGate(
      pr({ humanApprovedHead: true }),
      DEFAULT_HIGH_RISK_PATTERNS,
      none,
    );
    expect(gate.tier).toBe("hoog");
    expect(gate.needsHumanReview).toBe(false);
  });

  it("heeft geen review nodig bij een normale PR", () => {
    const gate = riskGate(
      pr(files(["a.ts"])),
      DEFAULT_HIGH_RISK_PATTERNS,
      none,
    );
    expect(gate.needsHumanReview).toBe(false);
  });

  it("laat een override op een eigen PR en dezelfde head gelden", () => {
    const key = `acme/widgets#7@abc1234`;
    expect(overrideKey(pr())).toBe(key);
    const gate = riskGate(pr(), DEFAULT_HIGH_RISK_PATTERNS, new Set([key]));
    expect(gate.needsHumanReview).toBe(false);
  });

  it("negeert een override voor een andere head-sha", () => {
    const old = new Set(["acme/widgets#7@old0000"]);
    expect(
      riskGate(pr(), DEFAULT_HIGH_RISK_PATTERNS, old).needsHumanReview,
    ).toBe(true);
  });

  it("negeert een override voor hetzelfde nummer in een andere repo", () => {
    const other = new Set(["acme/other#7@abc1234"]);
    expect(
      riskGate(pr(), DEFAULT_HIGH_RISK_PATTERNS, other).needsHumanReview,
    ).toBe(true);
  });

  it("kent geen override op een PR van iemand anders", () => {
    const set = new Set([overrideKey(pr())]);
    expect(
      riskGate(pr({ authoredByMe: false }), DEFAULT_HIGH_RISK_PATTERNS, set)
        .needsHumanReview,
    ).toBe(true);
  });

  it("kent geen override zonder bekende head-sha", () => {
    const noHead = pr({ headOid: "" });
    const set = new Set([overrideKey(noHead)]);
    expect(
      riskGate(noHead, DEFAULT_HIGH_RISK_PATTERNS, set).needsHumanReview,
    ).toBe(true);
  });
});
