import type { ReactNode } from "react";
import type { PullRequest } from "../../lib/github/domain";
import type { PrStackInfo } from "../../lib/github/stacks";
import type { Settings } from "../../lib/settings";
import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import { preferredFixer, preferredReviewer } from "../agents/crossReview";
import type { AgentRun } from "../agents/useAgentRuns";
import { AgentActionButton } from "./AgentActionButton";
import { AGENT_LABEL, altReviewMode } from "./agentModes";
import "./detail.css";
import { AlertIcon, CheckIcon, CloseIcon } from "./icons";
import type { ChecklistItem, ChecklistTone } from "./mergeChecklist";
import { mergeChecklist } from "./mergeChecklist";

const TONE_COLOR: Record<ChecklistTone, string> = {
  ok: "var(--ok)",
  err: "var(--err)",
  warn: "var(--warn)",
  none: "var(--text-3)",
};

function ToneMark({ tone }: { tone: ChecklistTone }) {
  let icon: ReactNode;
  switch (tone) {
    case "ok":
      icon = <CheckIcon />;
      break;
    case "err":
      icon = <CloseIcon />;
      break;
    case "warn":
      icon = <AlertIcon />;
      break;
    case "none":
      icon = <span className="detail-checklist-dash" />;
      break;
  }
  return (
    <span className="detail-checklist-mark" style={{ color: TONE_COLOR[tone] }}>
      {icon}
    </span>
  );
}

/** Hoort de lopende run bij deze rij? Fixmodi bij hun eigen punt, een review
 * (met of zonder fixes) bij de review-rij; overige modi bij geen enkele rij. */
function rowOwnsRun(item: ChecklistItem, run: AgentRun): boolean {
  if (run.mode === "commentsOnly" || run.mode === "withFixes") {
    return item.key === "review";
  }
  return item.fix === run.mode;
}

interface ChecklistProps {
  pr: PullRequest;
  stackInfo: PrStackInfo | undefined;
  run: AgentRun | undefined;
  settings: Settings;
  disabledReason: (agent: ReviewAgent) => string | null;
  onStartRun: (pr: PullRequest, agent: ReviewAgent, mode: AgentMode) => void;
  onCancelRun: (runId: string) => void;
}

/** De merge-checklist bovenaan het detailpaneel: elk punt met zijn fix op de
 * regel van het probleem. */
export function Checklist({
  pr,
  stackInfo,
  run,
  settings,
  disabledReason,
  onStartRun,
  onCancelRun,
}: ChecklistProps) {
  const items = mergeChecklist(pr, stackInfo);
  const runningRun = run?.status === "running" ? run : undefined;
  const { primaryMode } = settings.review;
  const fixer = preferredFixer(pr);

  const modelLine = (agent: ReviewAgent) =>
    `${settings[agent].model} · ${settings[agent].effort}`;
  // De modelregel van de reviewknop volgt de modus: Comments draait op het leesmodel.
  const reviewModelLine = (agent: ReviewAgent, mode: AgentMode) =>
    mode === "commentsOnly"
      ? `${settings[agent].commentsOnlyModel} · ${settings[agent].effort}`
      : modelLine(agent);

  function action(item: ChecklistItem): ReactNode {
    if (runningRun != null) {
      return rowOwnsRun(item, runningRun) ? (
        <button
          type="button"
          className="detail-checklist-stop"
          onClick={() => onCancelRun(runningRun.runId)}
        >
          Stop
        </button>
      ) : null;
    }
    if (item.key === "review") {
      return (
        <AgentActionButton
          pr={pr}
          label={(agent) => `Review met ${AGENT_LABEL[agent]}`}
          preferred={preferredReviewer(pr.author)}
          mode={primaryMode}
          extraModes={[altReviewMode(primaryMode)]}
          disabledReason={disabledReason}
          modelLine={reviewModelLine}
          kbd="R"
          onStartRun={onStartRun}
        />
      );
    }
    const fix = item.fix;
    if (fix == null) return null;
    return (
      <AgentActionButton
        pr={pr}
        label={(agent) =>
          fix === "fixConflicts"
            ? `Los op met ${AGENT_LABEL[agent]}`
            : `Fix met ${AGENT_LABEL[agent]}`
        }
        preferred={fixer}
        mode={fix}
        disabledReason={disabledReason}
        modelLine={modelLine}
        onStartRun={onStartRun}
      />
    );
  }

  return (
    <section className="detail-card detail-checklist" aria-label="Checklist">
      {items.map((item) => {
        const running =
          runningRun != null && rowOwnsRun(item, runningRun)
            ? runningRun
            : undefined;
        const detail =
          running != null
            ? `${AGENT_LABEL[running.agent]} is bezig`
            : item.detail;
        const act = action(item);
        return (
          <div key={item.key} className="detail-checklist-row">
            <ToneMark tone={item.tone} />
            <div className="detail-checklist-text">
              <span
                className={
                  item.tone === "none"
                    ? "detail-checklist-label detail-checklist-label-none"
                    : "detail-checklist-label"
                }
              >
                {item.label}
              </span>
              {detail != null && (
                <span
                  className={
                    item.key === "checks" && running == null
                      ? "detail-checklist-detail mono"
                      : "detail-checklist-detail"
                  }
                  title={detail}
                >
                  {detail}
                </span>
              )}
            </div>
            {act != null && (
              <div className="detail-checklist-action">{act}</div>
            )}
          </div>
        );
      })}
    </section>
  );
}
