import { useEffect, useRef, useState } from "react";
import "./agents.css";
import { StopIcon } from "../prs/icons";
import type { AgentRun } from "./useAgentRuns";

const STATUS_LABEL: Record<AgentRun["status"], string> = {
  running: "reviewt",
  done: "klaar",
  failed: "gefaald",
  cancelled: "geannuleerd",
};

/** Kopieert de volledige log naar het klembord; valt terug op een korte
 * foutmelding als de browser/OS het weigert (bijv. geen focus). */
async function copyLog(lines: string[]): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(lines.join("\n"));
    return "copied";
  } catch {
    return "failed";
  }
}

/**
 * Vervangt de agent-knoppen tijdens een run. Kop met pulserende stip, tijd
 * en Stop; log met een eigen overflow, max-height 132px, white-space: pre.
 */
export function AgentLogPanel({
  run,
  onCancel,
}: {
  run: AgentRun;
  onCancel: (runId: string) => void;
}) {
  const bodyRef = useRef<HTMLPreElement>(null);
  const [copyLabel, setCopyLabel] = useState("Kopieer");
  const copyLabelTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const el = bodyRef.current;
    if (el && run.lines.length > 0) el.scrollTop = el.scrollHeight;
  }, [run.lines.length]);

  useEffect(() => {
    return () => {
      if (copyLabelTimer.current != null) clearTimeout(copyLabelTimer.current);
    };
  }, []);

  return (
    <div className="agent-log">
      <div className="agent-log-head">
        {run.status === "running" ? <span className="agent-log-dot" /> : null}
        <span
          className={
            run.status === "running"
              ? "agent-log-label"
              : `agent-log-label agent-log-status-${run.status}`
          }
        >
          {run.agent} {STATUS_LABEL[run.status]}
          {run.status === "failed" && run.exitCode != null
            ? ` (code ${run.exitCode})`
            : ""}
        </span>
        <button
          type="button"
          className="agent-log-copy"
          onClick={() => {
            void copyLog(run.lines).then((result) => {
              setCopyLabel(
                result === "copied" ? "Gekopieerd" : "Kopiëren mislukt",
              );
              if (copyLabelTimer.current != null) {
                clearTimeout(copyLabelTimer.current);
              }
              copyLabelTimer.current = setTimeout(
                () => setCopyLabel("Kopieer"),
                1500,
              );
            });
          }}
        >
          {copyLabel}
        </button>
        {run.status === "running" && (
          <button
            type="button"
            className="agent-log-stop"
            onClick={() => onCancel(run.runId)}
          >
            <StopIcon size={9} /> Stop
          </button>
        )}
      </div>
      <pre ref={bodyRef} className="agent-log-body mono">
        {run.lines.length === 0 ? "Wachten op output..." : run.lines.join("\n")}
      </pre>
    </div>
  );
}
