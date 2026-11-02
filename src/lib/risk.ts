import type { PullRequest } from "./github/domain";

export const DEFAULT_HIGH_RISK_PATTERNS: readonly string[] = [
  "**/auth/**",
  "**/auth.*",
  "**/authentication.*",
  "**/auth-*.*",
  "**/oauth/**",
  "**/authz/**",
  "**/session/**",
  "**/session.*",
  "**/sessions/**",
  "**/payment*/**",
  "**/payment*.*",
  "**/checkout/**",
  "**/checkout.*",
  "**/billing/**",
  "**/billing.*",
  "**/migrations/**",
  "**/migrate/**",
  ".github/workflows/**",
  "**/Dockerfile*",
];

/** Zoveel bestanden haalt de lijst-query per PR op (`files(first: 100)`). */
export const MAX_FILES = 100;
const MAX_REASON_PATHS = 3;

const regexCache = new Map<string, RegExp>();

/**
 * Glob naar regex: `**` is nul of meer mappen, `*` tekens binnen een segment,
 * `?` een teken. Al het andere wordt letterlijk genomen; hoofdletterongevoelig.
 */
function globToRegExp(pattern: string): RegExp {
  const cached = regexCache.get(pattern);
  if (cached) return cached;
  let source = "";
  for (let i = 0; i < pattern.length; i++) {
    const char = pattern.charAt(i);
    if (char === "*" && pattern.charAt(i + 1) === "*") {
      if (pattern.charAt(i + 2) === "/") {
        source += "(?:.*/)?";
        i += 2;
      } else {
        source += ".*";
        i += 1;
      }
    } else if (char === "*") {
      source += "[^/]*";
    } else if (char === "?") {
      source += "[^/]";
    } else {
      source += char.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
  }
  const regex = new RegExp(`^${source}$`, "i");
  regexCache.set(pattern, regex);
  return regex;
}

export function matchesGlob(pattern: string, path: string): boolean {
  return globToRegExp(pattern).test(path);
}

export function patternsForRepo(
  repoId: string,
  riskPatterns: Record<string, string[]>,
): readonly string[] {
  const own = riskPatterns[repoId];
  return own != null && own.length > 0 ? own : DEFAULT_HIGH_RISK_PATTERNS;
}

export interface RiskTier {
  tier: "hoog" | "normaal";
  reasons: string[];
}

export function riskTier(
  pr: Pick<PullRequest, "changedPaths" | "changedFileCount">,
  patterns: readonly string[],
): RiskTier {
  const regexes = patterns.map(globToRegExp);
  const hits = pr.changedPaths.filter((path) =>
    regexes.some((regex) => regex.test(path)),
  );
  const reasons = hits.slice(0, MAX_REASON_PATHS);
  if (hits.length > MAX_REASON_PATHS) {
    reasons.push(`+${hits.length - MAX_REASON_PATHS}`);
  }
  if (pr.changedFileCount > MAX_FILES) {
    reasons.push(`meer dan ${MAX_FILES} bestanden`);
  } else if (pr.changedFileCount > pr.changedPaths.length) {
    reasons.push("niet alle bestanden bekend");
  }
  return { tier: reasons.length > 0 ? "hoog" : "normaal", reasons };
}

type RiskPr = Pick<
  PullRequest,
  | "repoId"
  | "number"
  | "headOid"
  | "authoredByMe"
  | "humanApprovedHead"
  | "changedPaths"
  | "changedFileCount"
>;

/** Een override geldt voor één PR op één head-sha: een nieuwe commit vraagt opnieuw. */
export function overrideKey(
  pr: Pick<PullRequest, "repoId" | "number" | "headOid">,
): string {
  return `${pr.repoId}#${pr.number}@${pr.headOid}`;
}

export const NORMAL_GATE: RiskGate = {
  tier: "normaal",
  reasons: [],
  needsHumanReview: false,
};

export interface RiskGate extends RiskTier {
  /** Hoog risico zonder menselijke approval op de head en zonder geldige override. */
  needsHumanReview: boolean;
}

/** De enige plek die beslist of een PR een menselijke review nodig heeft; mergeReasons, de checklist en de ranking lezen alleen deze uitkomst. */
export function riskGate(
  pr: RiskPr,
  patterns: readonly string[],
  overrides: ReadonlySet<string>,
): RiskGate {
  const tier = riskTier(pr, patterns);
  const overridden =
    pr.authoredByMe && pr.headOid !== "" && overrides.has(overrideKey(pr));
  return {
    ...tier,
    needsHumanReview:
      tier.tier === "hoog" && !pr.humanApprovedHead && !overridden,
  };
}
