import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useCallback, useEffect, useRef, useState } from "react";
import type { PullRequest } from "../../lib/github/domain";
import { isMockApp, mockMode } from "../../lib/mock/mode";
import type { Settings } from "../../lib/settings";
import type { AgentMode, ReviewAgent } from "./crossReview";

const IS_MOCK = isMockApp(mockMode());

/** Repo's die "lokaal gekoppeld" zijn in de mockmodus; portal-projects
 * ontbreekt bewust zodat RepoPathSetup ook zichtbaar is. */
const MOCK_REPO_PATHS: Record<string, string> = {
  "acme/storefront": "~/Code/storefront",
  "acme/charity-site": "~/Code/charity-site",
  "acme/jobs-api": "~/Code/jobs-api",
  "acme/knowledge-base": "~/Code/knowledge-base",
  "acme/portal-frontend": "~/Code/portal-frontend",
  "acme/waste-portal": "~/Code/waste-portal",
  "acme/careers-site": "~/Code/careers-site",
};

/** Zelfde vorm als de logregels die claude_stream.rs uit claude's stream-json
 * maakt: »-regels voor tool-aanroepen, kale tekstregels voor de agent zelf. */
const MOCK_LOG_LINES = [
  "» Bash: gh pr diff 167",
  "Ik lees eerst de volledige diff en de omliggende code van de deploy-scripts.",
  "» Read: deploy/release.sh",
  "» Bash: grep -n 'rm -rf' deploy/release.sh",
  "tool-fout: Exit code 2",
  "De symlink-swap in release.sh is niet atomisch en regel 82 draait rm -rf zonder guard op een leeg pad.",
  "» Bash: gh api repos/{owner}/{repo}/pulls/167/reviews --input -",
  "Review geplaatst met 3 inline comments.",
  "klaar in 47s",
];

export interface AgentRun {
  runId: string;
  prKey: string;
  agent: ReviewAgent;
  mode: AgentMode;
  status: "running" | "done" | "failed" | "cancelled";
  lines: string[];
  exitCode?: number;
}

export interface AgentClis {
  claude: boolean;
  codex: boolean;
}

/** Payload van het `list_runs`-commando: Rust is de bron van waarheid voor
 * lopende en net afgeronde runs, inclusief hun gebufferde log. */
interface RunSnapshot {
  runId: string;
  prKey: string;
  agent: string;
  mode: string;
  status: AgentRun["status"];
  lines: string[];
  exitCode: number | null;
}

/** Houdt de logregels per run beperkt zodat een lange run het geheugen niet opvreet. */
const MAX_LINES = 500;

export function prKeyOf(pr: PullRequest): string {
  return `${pr.repoId}#${pr.number}`;
}

export function useAgentRuns(
  settings: Settings,
  /** U10: wordt aangeroepen zodra een run afrondt met "done" of "failed" (dus
   * niet bij "cancelled"), zodat de aanroeper eenmalig een toast kan tonen, de
   * PR-lijst kan verversen en op mode/agent een vervolg-run kan starten. */
  onRunFinished?: (
    prKey: string,
    status: "done" | "failed",
    agent: ReviewAgent,
    mode: AgentMode,
  ) => void,
) {
  const [runs, setRuns] = useState<Map<string, AgentRun>>(new Map());
  const [clis, setClis] = useState<AgentClis>(
    IS_MOCK ? { claude: true, codex: true } : { claude: false, codex: false },
  );
  const [repoPaths, setRepoPaths] = useState<Record<string, string>>(
    IS_MOCK ? MOCK_REPO_PATHS : {},
  );
  const cancelled = useRef<Set<string>>(new Set());
  // Voorkomt een dubbele onRunFinished-melding voor dezelfde run: nodig
  // zodra de statusovergang in de setRuns-updater zelf gebeurt (die kan door
  // React/StrictMode meer dan eenmaal aangeroepen worden voor hetzelfde
  // event).
  const notifiedRunIds = useRef<Set<string>>(new Set());
  const mockTimers = useRef<Map<string, ReturnType<typeof setInterval>>>(
    new Map(),
  );
  const timeoutTimers = useRef<Map<string, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const settingsRef = useRef(settings);
  settingsRef.current = settings;
  const onRunFinishedRef = useRef(onRunFinished);
  onRunFinishedRef.current = onRunFinished;
  const runsRef = useRef(runs);
  useEffect(() => {
    runsRef.current = runs;
  }, [runs]);

  /** Zet regels achter een lopende run; een run die al klaar (of gecanceld) is
   * blijft ongemoeid. */
  const appendLines = useCallback((runId: string, lines: string[]) => {
    setRuns((current) => {
      const run = current.get(runId);
      if (!run) return current;
      const next = new Map(current);
      next.set(runId, {
        ...run,
        lines: [...run.lines, ...lines].slice(-MAX_LINES),
      });
      return next;
    });
  }, []);

  const clearTimeoutTimer = useCallback((runId: string) => {
    const timer = timeoutTimers.current.get(runId);
    if (timer != null) {
      clearTimeout(timer);
      timeoutTimers.current.delete(runId);
    }
  }, []);

  /** Beëindigt een run die zijn ingestelde time-out overschrijdt met een
   * duidelijke logregel; ruimt zichzelf op zodra de run al klaar is. */
  const armTimeout = useCallback(
    (runId: string) => {
      const timeoutMinutes = settingsRef.current.review.timeoutMinutes;
      const timer = setTimeout(
        () => {
          timeoutTimers.current.delete(runId);
          const mockTimer = mockTimers.current.get(runId);
          if (mockTimer != null) {
            clearInterval(mockTimer);
            mockTimers.current.delete(runId);
          }
          setRuns((current) => {
            const run = current.get(runId);
            if (run?.status !== "running") return current;
            const next = new Map(current);
            next.set(runId, {
              ...run,
              status: "cancelled",
              lines: [
                ...run.lines,
                `time-out na ${timeoutMinutes} min: run automatisch gestopt`,
              ],
            });
            return next;
          });
          // Mislukt het stoppen aan de Rust-kant, dan draait de agent nog door:
          // dat hoort zichtbaar te zijn in de log en niet stil te verdwijnen.
          if (!IS_MOCK) {
            void invoke("cancel_agent_review", { runId }).catch((error) => {
              appendLines(runId, [`stoppen mislukt: ${String(error)}`]);
            });
          }
        },
        timeoutMinutes * 60 * 1000,
      );
      timeoutTimers.current.set(runId, timer);
    },
    [appendLines],
  );

  useEffect(() => {
    if (IS_MOCK) return;
    void invoke<AgentClis>("check_agent_clis").then(setClis);
    void invoke<Record<string, string>>("get_repo_paths")
      .then(setRepoPaths)
      .catch((error) => {
        console.error("kon lokale mappen niet laden", error);
      });
    // Rust is de bron van waarheid: herstelt lopende (nog cancelbare) en net
    // afgeronde runs die vóór deze mount al gestart waren.
    void invoke<RunSnapshot[]>("list_runs").then((snapshots) => {
      if (snapshots.length === 0) return;
      setRuns((current) => {
        const next = new Map(current);
        for (const snapshot of snapshots) {
          if (next.has(snapshot.runId)) continue;
          next.set(snapshot.runId, {
            runId: snapshot.runId,
            prKey: snapshot.prKey,
            agent: snapshot.agent as ReviewAgent,
            mode: snapshot.mode as AgentMode,
            status: snapshot.status,
            lines: snapshot.lines,
            exitCode: snapshot.exitCode ?? undefined,
          });
        }
        return next;
      });
      // Een herstelde run die nog "running" is kreeg door de reload nog geen
      // timer: de volle time-outduur opnieuw arm gaat op de klok van de
      // reload i.p.v. de oorspronkelijke start, wat acceptabel is (Rust kent
      // de echte starttijd niet mee terug).
      for (const snapshot of snapshots) {
        if (snapshot.status === "running") armTimeout(snapshot.runId);
      }
    });
  }, [armTimeout]);

  // Ruimt alle openstaande timers op bij unmount, zodat een run die nog
  // loopt geen timer laat afgaan op een verdwenen component.
  useEffect(() => {
    return () => {
      for (const timer of timeoutTimers.current.values()) clearTimeout(timer);
      timeoutTimers.current.clear();
      for (const timer of mockTimers.current.values()) clearInterval(timer);
      mockTimers.current.clear();
    };
  }, []);

  useEffect(() => {
    if (IS_MOCK) return;
    const unlisteners = [
      // Rust bundelt logregels: één event draagt een batch.
      listen<{ runId: string; lines: string[] }>("agent-log", (event) => {
        appendLines(event.payload.runId, event.payload.lines);
      }),
      listen<{ runId: string; exitCode: number }>("agent-done", (event) => {
        const { runId, exitCode } = event.payload;
        clearTimeoutTimer(runId);
        const wasCancelled = cancelled.current.has(runId);
        cancelled.current.delete(runId);
        // De statusovergang leest en schrijft hier bewust binnen dezelfde
        // setRuns-updater (i.p.v. via runsRef.current, gevuld door een
        // post-commit-effect): komt agent-done vóór dat effect (een direct
        // falende run, of eentje die afrondt tijdens de list_runs-herstel),
        // dan leest de updater wél de al-gecommitte state en blijft de run
        // niet stil op "running" hangen.
        setRuns((current) => {
          const run = current.get(runId);
          // "cancelled" is terminaal: het afloop-event van een gestopte
          // agent mag hem niet alsnog op done of failed zetten.
          if (!run || run.status === "cancelled") return current;
          const nextStatus = wasCancelled
            ? "cancelled"
            : exitCode === 0
              ? "done"
              : "failed";
          const next = new Map(current);
          next.set(runId, { ...run, status: nextStatus, exitCode });
          // U10: een afgeronde run (niet gecancelled) meldt zich eenmalig bij
          // de aanroeper voor een toast + PR-refresh.
          if (
            nextStatus !== "cancelled" &&
            !notifiedRunIds.current.has(runId)
          ) {
            notifiedRunIds.current.add(runId);
            onRunFinishedRef.current?.(
              run.prKey,
              nextStatus,
              run.agent,
              run.mode,
            );
          }
          return next;
        });
      }),
    ];
    return () => {
      for (const unlisten of unlisteners) {
        void unlisten.then((fn) => fn());
      }
    };
  }, [clearTimeoutTimer, appendLines]);

  const refreshRepoPaths = useCallback(async () => {
    if (IS_MOCK) return;
    try {
      setRepoPaths(await invoke<Record<string, string>>("get_repo_paths"));
    } catch (error) {
      console.error("kon lokale mappen niet verversen", error);
    }
  }, []);

  const startRun = useCallback(
    async (pr: PullRequest, agent: ReviewAgent, mode: AgentMode) => {
      const repoPath = repoPaths[pr.repoId];
      if (repoPath == null || repoPath === "") {
        throw new Error(
          `Geen lokale map bekend voor ${pr.repoId}. Zoek of stel er een in.`,
        );
      }
      const runId = crypto.randomUUID();
      // "model · effort" gaat mee als eerste logregel van de run (design v2).
      const { model, effort } = settingsRef.current[agent];
      const firstLine = `${model} · ${effort}`;
      setRuns((current) => {
        const next = new Map(current);
        next.set(runId, {
          runId,
          prKey: prKeyOf(pr),
          agent,
          mode,
          status: "running",
          lines: [firstLine],
        });
        return next;
      });
      armTimeout(runId);
      if (IS_MOCK) {
        const TOTAL_TICKS = 20; // ~8s bij 400ms per tick
        let tick = 0;
        const timer = setInterval(() => {
          tick += 1;
          if (tick >= TOTAL_TICKS) {
            clearInterval(timer);
            mockTimers.current.delete(runId);
            clearTimeoutTimer(runId);
            const wasCancelled = cancelled.current.has(runId);
            cancelled.current.delete(runId);
            const nextStatus = wasCancelled ? "cancelled" : "done";
            const finished = runsRef.current.get(runId);
            setRuns((current) => {
              const run = current.get(runId);
              if (!run) return current;
              const next = new Map(current);
              next.set(runId, { ...run, status: nextStatus, exitCode: 0 });
              return next;
            });
            if (nextStatus !== "cancelled" && finished != null) {
              onRunFinishedRef.current?.(
                finished.prKey,
                nextStatus,
                finished.agent,
                finished.mode,
              );
            }
          } else if (tick <= MOCK_LOG_LINES.length) {
            setRuns((current) => {
              const run = current.get(runId);
              if (!run) return current;
              const next = new Map(current);
              next.set(runId, {
                ...run,
                lines: [...run.lines, MOCK_LOG_LINES[tick - 1] as string],
              });
              return next;
            });
          }
        }, 400);
        mockTimers.current.set(runId, timer);
        return;
      }
      try {
        await invoke("start_agent_review", {
          runId,
          repoId: pr.repoId,
          repoPath,
          prNumber: pr.number,
          headRef: pr.headRef,
          baseRef: pr.baseRef,
          agent,
          mode,
          model,
          effort,
        });
      } catch (error) {
        clearTimeoutTimer(runId);
        setRuns((current) => {
          const run = current.get(runId);
          if (!run) return current;
          const next = new Map(current);
          next.set(runId, {
            ...run,
            status: "failed",
            lines: [...run.lines, String(error)],
          });
          return next;
        });
        throw error;
      }
    },
    [repoPaths, armTimeout, clearTimeoutTimer],
  );

  const cancelRun = useCallback(
    async (runId: string) => {
      cancelled.current.add(runId);
      clearTimeoutTimer(runId);
      if (IS_MOCK) {
        const timer = mockTimers.current.get(runId);
        if (timer != null) {
          clearInterval(timer);
          mockTimers.current.delete(runId);
        }
        cancelled.current.delete(runId);
        setRuns((current) => {
          const run = current.get(runId);
          if (!run) return current;
          const next = new Map(current);
          next.set(runId, { ...run, status: "cancelled" });
          return next;
        });
        return;
      }
      try {
        await invoke("cancel_agent_review", { runId });
      } catch (error) {
        // De agent draait dan gewoon door; dat mag de gebruiker niet ontgaan.
        cancelled.current.delete(runId);
        appendLines(runId, [`stoppen mislukt: ${String(error)}`]);
        throw error;
      }
    },
    [clearTimeoutTimer, appendLines],
  );

  const runForPr = useCallback(
    (prKey: string): AgentRun | undefined => {
      let latest: AgentRun | undefined;
      for (const run of runs.values()) {
        if (run.prKey !== prKey) continue;
        if (run.status === "running") return run;
        latest = run;
      }
      return latest;
    },
    [runs],
  );

  const runningPrKeys = new Set(
    [...runs.values()]
      .filter((run) => run.status === "running")
      .map((run) => run.prKey),
  );

  return {
    clis,
    repoPaths,
    refreshRepoPaths,
    startRun,
    cancelRun,
    runForPr,
    runningPrKeys,
  };
}
