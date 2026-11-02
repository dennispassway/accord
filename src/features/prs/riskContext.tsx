import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
} from "react";
import type { PullRequest } from "../../lib/github/domain";
import {
  DEFAULT_HIGH_RISK_PATTERNS,
  overrideKey,
  patternsForRepo,
  type RiskGate,
  riskGate,
} from "../../lib/risk";

export interface RiskApi {
  gateOf: (pr: PullRequest) => RiskGate;
  /** Zet de override voor deze PR op deze head-sha (alleen in geheugen). */
  grantOverride: (pr: PullRequest) => void;
}

const NO_OVERRIDES: ReadonlySet<string> = new Set();

/** Zonder provider (tests) gelden de standaardpatronen en geen overrides. */
const RiskContext = createContext<RiskApi>({
  gateOf: (pr) => riskGate(pr, DEFAULT_HIGH_RISK_PATTERNS, NO_OVERRIDES),
  grantOverride: () => {},
});

export const RiskProvider = RiskContext.Provider;

export function useRisk(): RiskApi {
  return useContext(RiskContext);
}

export function useRiskApi(riskPatterns: Record<string, string[]>): RiskApi {
  const [overrides, setOverrides] = useState<ReadonlySet<string>>(NO_OVERRIDES);
  const gateOf = useCallback(
    (pr: PullRequest) =>
      riskGate(pr, patternsForRepo(pr.repoId, riskPatterns), overrides),
    [riskPatterns, overrides],
  );
  const grantOverride = useCallback((pr: PullRequest) => {
    setOverrides((current) => new Set(current).add(overrideKey(pr)));
  }, []);
  return useMemo(() => ({ gateOf, grantOverride }), [gateOf, grantOverride]);
}
