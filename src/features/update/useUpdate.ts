import { relaunch } from "@tauri-apps/plugin-process";
import { check, type Update } from "@tauri-apps/plugin-updater";
import { useCallback, useEffect, useRef, useState } from "react";
import { mockMode } from "../../lib/mock/mode";
import {
  type CheckOutcome,
  checkIntervalMs,
  toUpdateState,
  type UpdateState,
} from "./updateState";

const DISMISSED_KEY = "pr-cockpit.update-dismissed";

const MOCK_OUTCOME: CheckOutcome = {
  kind: "update",
  version: "0.4.0",
  notes:
    "- Menubar-teller telt nu ook draft-PR's mee\n- Snellere eerste laadbeurt\n- Fix: sortering per stack bleef soms hangen",
};

function closeSilently(update: Update | null): void {
  if (update != null) void update.close().catch(() => {});
}

/** Houdt de updater-check volledig buiten het opstartpad van de app: een trage
 * of onbereikbare endpoint mag de UI nooit blokkeren, en een fout (bv. de 404
 * vóór de eerste release met latest.json) blijft stil. */
export function useUpdate(refreshMinutes: number) {
  const [state, setState] = useState<UpdateState>({ status: "idle" });
  const mock = mockMode() === "update";
  const availableUpdate = useRef<Update | null>(null);
  const installing = useRef(false);
  const checkGeneration = useRef(0);
  // Alleen voor deze sessie: een weggeklikte versie mag na een herstart best
  // weer gemeld worden, dat is precies het moment waarop updaten goedkoop is.
  const dismissed = useRef<string | null>(
    typeof sessionStorage === "undefined"
      ? null
      : sessionStorage.getItem(DISMISSED_KEY),
  );

  const runCheck = useCallback(async () => {
    const generation = ++checkGeneration.current;
    let outcome: CheckOutcome;
    if (mock) {
      outcome = MOCK_OUTCOME;
    } else {
      try {
        const update = await check();
        if (generation !== checkGeneration.current || installing.current) {
          closeSilently(update);
          return;
        }
        const previous = availableUpdate.current;
        outcome =
          update == null
            ? { kind: "none" }
            : {
                kind: "update",
                version: update.version,
                notes: update.body ?? "",
              };
        const nextState = toUpdateState(outcome, dismissed.current);
        availableUpdate.current =
          nextState.status === "available" ? update : null;
        closeSilently(previous);
        if (nextState.status !== "available") closeSilently(update);
      } catch (error) {
        if (generation !== checkGeneration.current) return;
        const previous = availableUpdate.current;
        availableUpdate.current = null;
        closeSilently(previous);
        outcome = { kind: "error", message: (error as Error).message };
      }
    }
    setState((current) =>
      // Een lopende installatie mag een tussentijdse check niet terugzetten.
      current.status === "installing"
        ? current
        : toUpdateState(outcome, dismissed.current),
    );
  }, [mock]);

  useEffect(() => {
    void runCheck();
    const interval = checkIntervalMs(refreshMinutes);
    if (interval == null) return;
    const timer = setInterval(() => void runCheck(), interval);
    return () => clearInterval(timer);
  }, [runCheck, refreshMinutes]);

  useEffect(
    () => () => {
      checkGeneration.current += 1;
      const update = availableUpdate.current;
      availableUpdate.current = null;
      closeSilently(update);
    },
    [],
  );

  const dismiss = useCallback(() => {
    checkGeneration.current += 1;
    const update = availableUpdate.current;
    availableUpdate.current = null;
    closeSilently(update);
    setState((current) => {
      if (current.status === "available") {
        dismissed.current = current.version;
        if (typeof sessionStorage !== "undefined") {
          sessionStorage.setItem(DISMISSED_KEY, current.version);
        }
      }
      return { status: "idle" };
    });
  }, []);

  const install = useCallback(async () => {
    if (installing.current) return;
    installing.current = true;
    checkGeneration.current += 1;
    setState({ status: "installing" });
    if (mock) {
      installing.current = false;
      return;
    }
    const update = availableUpdate.current;
    availableUpdate.current = null;
    try {
      if (update == null) {
        setState({ status: "idle" });
        return;
      }
      await update.downloadAndInstall();
      await relaunch();
    } catch (error) {
      setState({ status: "idle" });
      throw error;
    } finally {
      installing.current = false;
      if (update != null) await update.close().catch(() => {});
    }
  }, [mock]);

  return { state, dismiss, install };
}
