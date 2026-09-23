import { invoke } from "@tauri-apps/api/core";
import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { useEffect, useRef, useState } from "react";
import "./agents.css";
import { isMockApp, mockMode } from "../../lib/mock/mode";
import { StopIcon } from "../prs/icons";
import { summarizeRun } from "./runSummary";
import type { AgentRun } from "./useAgentRuns";

const IS_MOCK = isMockApp(mockMode());

/** D5/U3: geen vaste "reviewt" meer; de status zelf is neutraal, de modus
 * staat er als apart woord naast (zie de kop hieronder) en de samenvatting
 * eronder (`summarizeRun`) zegt wat er precies gebeurde. */
const STATUS_LABEL: Record<AgentRun["status"], string> = {
  running: "bezig",
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

async function copyPath(path: string): Promise<"copied" | "failed"> {
  try {
    await navigator.clipboard.writeText(path);
    return "copied";
  } catch {
    return "failed";
  }
}

/** D5: de volle log komt niet mee met `run.lines` (die is begrensd op 500
 * regels voor de live stream) en moet dus apart van schijf komen; in
 * mockmodus is er geen logbestand, dus daar volstaan de in-memory regels. */
async function fetchFullLog(run: AgentRun): Promise<string> {
  if (IS_MOCK) return run.lines.join("\n");
  return invoke<string>("read_run_log", { runId: run.runId });
}

/**
 * Vervangt de agent-knoppen tijdens een run. Kop met pulserende stip, modus
 * en status; een samenvattingsregel (D5) erboven op de log; log met een
 * eigen overflow, max-height 132px, white-space: pre, met een knop om de
 * volledige log (van schijf) uit te klappen. Bij een worktree die bewaard
 * bleef (U4) staat er een aparte melding met acties.
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
  const [pathCopyLabel, setPathCopyLabel] = useState("Kopieer pad");
  const pathCopyTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [revealError, setRevealError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [fullLog, setFullLog] = useState<string | null>(null);
  const [fullLogError, setFullLogError] = useState<string | null>(null);
  // Alleen om "bezig sinds N min" bij te houden zolang de run loopt; klaar,
  // gefaald en geannuleerd tonen een vaste duur en hebben geen tik nodig.
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const el = bodyRef.current;
    if (el && run.lines.length > 0) el.scrollTop = el.scrollHeight;
  }, [run.lines.length]);

  useEffect(() => {
    if (run.status !== "running") return;
    const timer = setInterval(() => setNow(Date.now()), 30_000);
    return () => clearInterval(timer);
  }, [run.status]);

  useEffect(() => {
    return () => {
      if (copyLabelTimer.current != null) clearTimeout(copyLabelTimer.current);
      if (pathCopyTimer.current != null) clearTimeout(pathCopyTimer.current);
    };
  }, []);

  function toggleExpanded() {
    if (expanded) {
      setExpanded(false);
      return;
    }
    setExpanded(true);
    setFullLogError(null);
    void fetchFullLog(run)
      .then(setFullLog)
      .catch((error: unknown) => setFullLogError(String(error)));
  }

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
          {run.agent} · {STATUS_LABEL[run.status]}
          {run.status === "failed" && run.exitCode != null
            ? ` (code ${run.exitCode})`
            : ""}
        </span>
        <button
          type="button"
          className="agent-log-copy"
          onClick={toggleExpanded}
        >
          {expanded ? "Inklappen" : "Volledige log"}
        </button>
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
      <p className="agent-log-summary">{summarizeRun(run, now)}</p>
      {run.keptWorktree != null && (
        <div className="agent-log-keptnotice">
          <span>{run.unpushedCommits ?? 0} commit(s) staan alleen lokaal</span>
          <div className="agent-log-keptactions">
            <button
              type="button"
              onClick={() => {
                if (run.keptWorktree == null) return;
                setRevealError(null);
                revealItemInDir(run.keptWorktree).catch((error: unknown) => {
                  setRevealError(String(error));
                });
              }}
            >
              Toon map
            </button>
            <button
              type="button"
              onClick={() => {
                if (run.keptWorktree == null) return;
                void copyPath(run.keptWorktree).then((result) => {
                  setPathCopyLabel(
                    result === "copied" ? "Gekopieerd" : "Kopiëren mislukt",
                  );
                  if (pathCopyTimer.current != null) {
                    clearTimeout(pathCopyTimer.current);
                  }
                  pathCopyTimer.current = setTimeout(
                    () => setPathCopyLabel("Kopieer pad"),
                    1500,
                  );
                });
              }}
            >
              {pathCopyLabel}
            </button>
          </div>
          {revealError != null && (
            <p className="agent-log-revealerror">
              Kon de map niet openen: {revealError}
            </p>
          )}
        </div>
      )}
      <pre ref={bodyRef} className="agent-log-body mono">
        {run.lines.length === 0 ? "Wachten op output..." : run.lines.join("\n")}
      </pre>
      {expanded && (
        <pre className="agent-log-full mono">
          {fullLogError != null
            ? `kon de volledige log niet laden: ${fullLogError}`
            : (fullLog ?? "Bezig met laden...")}
        </pre>
      )}
    </div>
  );
}
