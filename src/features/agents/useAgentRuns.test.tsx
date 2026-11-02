import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_SETTINGS } from "../../lib/settings";
import { type AgentRun, useAgentRuns } from "./useAgentRuns";

const harness = vi.hoisted(() => ({
  effects: [] as (() => unknown)[],
  listeners: new Map<string, (event: { payload: unknown }) => void>(),
  runs: new Map<string, AgentRun>(),
}));

// Exercise the real event handler without a webview. Only hook storage and
// mounting are substituted; refs and memoization still run through React.
vi.mock("react", async (original) => {
  const react = await original<typeof import("react")>();
  return {
    ...react,
    useEffect: (effect: () => unknown) => harness.effects.push(effect),
    useState: (initial: unknown) => {
      if (initial instanceof Map) {
        return [
          harness.runs,
          (
            update: (current: Map<string, AgentRun>) => Map<string, AgentRun>,
          ) => {
            harness.runs = update(harness.runs);
          },
        ];
      }
      return [initial, () => {}];
    },
  };
});

vi.mock("@tauri-apps/api/core", () => ({
  invoke: vi.fn(async (command: string) => (command === "list_runs" ? [] : {})),
}));
vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (name, listener) => {
    harness.listeners.set(name, listener);
    return () => {};
  }),
}));

beforeEach(() => {
  harness.effects = [];
  harness.listeners.clear();
  harness.runs = new Map([
    [
      "run-1",
      {
        runId: "run-1",
        prKey: "acme/widgets#7",
        agent: "codex",
        mode: "commentsOnly",
        status: "running",
        startedAt: 0,
        lines: [],
      },
    ],
  ]);
});

describe("agent-done", () => {
  it.each(["failed", "done", "cancelled"] as const)(
    "neemt backendstatus %s over, ook na exit 0 met een geplaatste review",
    (status) => {
      const finished = vi.fn();
      function Harness() {
        useAgentRuns(DEFAULT_SETTINGS, finished);
        return null;
      }
      renderToStaticMarkup(<Harness />);
      for (const effect of harness.effects) effect();

      harness.listeners.get("agent-done")?.({
        payload: {
          runId: "run-1",
          exitCode: 0,
          status,
          reviewMissing: false,
          pushedCommits: 0,
          unpushedCommits: 0,
          keptWorktree: null,
        },
      });

      expect(harness.runs.get("run-1")?.status).toBe(status);
      if (status === "cancelled") {
        expect(finished).not.toHaveBeenCalled();
      } else {
        expect(finished).toHaveBeenCalledExactlyOnceWith(
          "acme/widgets#7",
          status,
          "codex",
          "commentsOnly",
        );
      }
    },
  );
});
