import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { useEffect, useRef } from "react";
import type { PullRequest, RepoId } from "../../lib/github/domain";
import { keyOfPr } from "./PrList";

const TRAY_ITEM_LIMIT = 8;
const TRAY_TITLE_MAX_LENGTH = 40;

function trayLabel(pr: PullRequest): string {
  const title =
    pr.title.length > TRAY_TITLE_MAX_LENGTH
      ? `${pr.title.slice(0, TRAY_TITLE_MAX_LENGTH)}…`
      : pr.title;
  return `${pr.repoId} #${pr.number} ${title}`;
}

/**
 * Houdt de macOS-tray in sync met alle PR's (los van de sidebar-filter) en
 * verwerkt tray-acties: verversen en een PR selecteren vanuit het tray-menu.
 */
export function useTraySync(
  allPrsSorted: PullRequest[],
  refresh: () => Promise<void>,
  setSelectedRepoId: (
    update: (current: RepoId | "all") => RepoId | "all",
  ) => void,
  setSelectedKey: (key: string) => void,
) {
  useEffect(() => {
    const count = allPrsSorted.filter((pr) => pr.reviewRequestedFromMe).length;
    const items = allPrsSorted.slice(0, TRAY_ITEM_LIMIT).map((pr) => ({
      key: keyOfPr(pr),
      label: trayLabel(pr),
    }));
    void invoke("update_tray", { count, items });
  }, [allPrsSorted]);

  // Refs zodat de event-listeners hieronder maar één keer opgezet hoeven te
  // worden en toch de laatste data zien.
  const allPrsSortedRef = useRef(allPrsSorted);
  allPrsSortedRef.current = allPrsSorted;
  const refreshRef = useRef(refresh);
  refreshRef.current = refresh;

  useEffect(() => {
    const unlistenRefresh = listen("tray-refresh", () => {
      void refreshRef.current();
    });
    const unlistenSelect = listen<string>("tray-select-pr", (event) => {
      const key = event.payload;
      const target = allPrsSortedRef.current.find((pr) => keyOfPr(pr) === key);
      if (!target) return;
      setSelectedRepoId((current) =>
        current === "all" || current === target.repoId ? current : "all",
      );
      setSelectedKey(key);
    });
    return () => {
      void unlistenRefresh.then((fn) => fn());
      void unlistenSelect.then((fn) => fn());
    };
  }, [setSelectedRepoId, setSelectedKey]);
}
