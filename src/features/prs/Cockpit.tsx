import { openUrl } from "@tauri-apps/plugin-opener";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { PrNumber, PullRequest, RepoId } from "../../lib/github/domain";
import type { MergeMethod } from "../../lib/github/merge";
import { mergeReasons } from "../../lib/github/merge";
import { groupByRepo } from "../../lib/github/organize";
import { computeStackInfo } from "../../lib/github/stacks";
import { modKey } from "../../lib/platform";
import { useSettings } from "../../lib/settings";
import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import { chainsIntoLearnings, preferredReviewer } from "../agents/crossReview";
import { prKeyOf, useAgentRuns } from "../agents/useAgentRuns";
import { SettingsSheet } from "../settings/SettingsSheet";
import { UpdateBanner } from "../update/UpdateBanner";
import { useUpdate } from "../update/useUpdate";
import "./contextmenu.css";
import { shouldConfirmBulkOpen } from "./bulkOpen";
import {
  loadRepoFilter,
  loadSortMode,
  saveRepoFilter,
  saveSortMode,
} from "./cockpitPrefs";
import { DetailPanel } from "./DetailPanel";
import { formatRelative } from "./format";
import { AlertIcon, CloseIcon } from "./icons";
import { loadMethod } from "./MergeSection";
import { isAnyMenuOverlayOpen } from "./menuOverlay";
import { PrContextMenu } from "./PrContextMenu";
import { PrInspector } from "./PrInspector";
import { keyOfPr, PrList } from "./PrList";
import { ShortcutHelp } from "./ShortcutHelp";
import { Sidebar } from "./Sidebar";
import type { SortCtx, SortMode } from "./sort";
import { buildSections } from "./sort";
import { Toast, useToast } from "./Toast";
import { Toolbar } from "./Toolbar";
import { usePrSelection } from "./usePrSelection";
import { shouldRefreshOnVisible, usePrs } from "./usePrs";
import { useTraySync } from "./useTraySync";

const MERGE_METHOD_LABEL: Record<MergeMethod, string> = {
  SQUASH: "squash",
  MERGE: "merge commit",
};

const SORT_MODES_BY_DIGIT: Record<string, SortMode> = {
  "1": "triage",
  "2": "prioriteit",
  "3": "bijgewerkt",
  "4": "oudste",
  "5": "omvang",
  "6": "project",
};

const SORT_LABELS: Record<SortMode, string> = {
  triage: "Triage",
  prioriteit: "Prioriteit",
  bijgewerkt: "Bijgewerkt",
  oudste: "Aangemaakt",
  omvang: "Omvang",
  project: "Project",
};

/**
 * B5: met welk menu dan ook open (settings-sheet, sortmenu, contextmenu, of
 * het merge-methode-/agent-modusmenu via de DOM-overlay-check) mogen
 * M/R/pijltjes/Enter niets doen.
 */
export function computeShortcutsEnabled(state: {
  settingsOpen: boolean;
  sortOpen: boolean;
  contextMenuOpen: boolean;
  menuOverlayOpen: boolean;
  inspectorOpen: boolean;
}): boolean {
  return (
    !state.settingsOpen &&
    !state.sortOpen &&
    !state.contextMenuOpen &&
    !state.menuOverlayOpen &&
    !state.inspectorOpen
  );
}

/** Reden-teksten voor de R-shortcut, gelijk aan de `disabledReason`-teksten
 * in DetailPanel.tsx (dat bestand valt buiten deze slice om aan te passen). */
function agentStartBlockedReason(
  agent: string,
  hasCli: boolean,
  repoPath: string | undefined,
): string | null {
  if (!hasCli) return `de ${agent}-CLI is niet gevonden op deze machine`;
  if (repoPath == null || repoPath === "")
    return "koppel eerst de lokale map van dit project";
  return null;
}

interface CockpitProps {
  login: string;
  onAuthError: () => void;
  onLogout: () => void;
}

export function Cockpit({ login, onAuthError, onLogout }: CockpitProps) {
  const {
    state,
    refresh,
    updatePriority,
    mergePr,
    clearWriteError,
    clearRefreshError,
    refreshing,
  } = usePrs(onAuthError);
  const { toasts, showToast } = useToast();
  const { settings, update: updateSettings } = useSettings();
  const update = useUpdate(settings.review.refreshMinutes);
  const {
    clis,
    repoPaths,
    refreshRepoPaths,
    startRun,
    cancelRun,
    runForPr,
    runningPrKeys,
  } = useAgentRuns(settings, (prKey, status, agent, mode) => {
    // U10: een afgeronde agent-run is verder onzichtbaar zolang je niet zelf
    // op die PR zit te kijken; één toast plus één refresh maakt 'm zichtbaar
    // zonder een aparte polling-loop toe te voegen. Cancelled runs melden
    // zich hier bewust niet (die stopte je zelf al bewust).
    const [, number] = prKey.split("#");
    showToast(
      status === "done"
        ? `Review klaar: #${number}`
        : `Review mislukt: #${number}`,
      status === "done" ? "ok" : "fout",
    );
    void refresh();
    // Lessen structureel: na een geslaagde run die fixes toepaste destilleert
    // dezelfde agent automatisch de lessen; de prompt stopt zelf als er geen
    // generaliseerbare les in de comments zit.
    if (status === "done" && chainsIntoLearnings(mode)) {
      const pr = prs.find((candidate) => keyOfPr(candidate) === prKey);
      if (pr != null) {
        showToast(`Lessen vastleggen gestart: #${number}`, "ok");
        void startRun(pr, agent, "distillLearnings").catch((error: unknown) => {
          showToast(String(error), "fout");
        });
      }
    }
  });
  const [selectedRepoId, setSelectedRepoIdState] = useState<RepoId | "all">(
    () => loadRepoFilter() as RepoId | "all",
  );
  const [search, setSearch] = useState("");
  const [sortMode, setSortModeState] = useState<SortMode>(loadSortMode);
  const setSelectedRepoId = useCallback(
    (
      next: (RepoId | "all") | ((current: RepoId | "all") => RepoId | "all"),
    ) => {
      setSelectedRepoIdState((current) => {
        const repoId = typeof next === "function" ? next(current) : next;
        saveRepoFilter(repoId);
        return repoId;
      });
    },
    [],
  );
  const setSortMode = useCallback((mode: SortMode) => {
    setSortModeState(mode);
    saveSortMode(mode);
  }, []);
  const [sortOpen, setSortOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [inspector, setInspector] = useState<null | {
    tab: "diff" | "comments";
    key: string;
  }>(null);
  const [contextMenu, setContextMenu] = useState<{
    position: { x: number; y: number };
    prKeys: string[];
  } | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const cockpitRef = useRef<HTMLDivElement>(null);

  const prs = state.status === "ready" ? state.prs : [];
  const groups = useMemo(() => groupByRepo(prs), [prs]);
  // U2a: de app-start hoeft niet meer op een aparte /user-call te wachten
  // (useAuth kent de login-naam dan nog niet); zodra de PR-fetch of de
  // bewaarde snapshot een viewerLogin heeft, wint die van de lege prop.
  const meLogin =
    (state.status === "ready" ? state.viewerLogin : null) ?? login;

  // B7: verdwijnt de gefilterde repo uit groups (bv. na een refresh zonder
  // PR's meer in dat project), val dan terug op "Alles" in plaats van een
  // onophefbaar leeg filter. Alleen resetten zodra er echt PR's geladen zijn
  // (state "ready" met groups) - anders wist een nog ladende of lege lijst
  // de opgeslagen repo-filter (U: persistente sorteermodus/repo-filter).
  useEffect(() => {
    if (selectedRepoId === "all") return;
    if (state.status !== "ready" || groups.length === 0) return;
    if (groups.some((group) => group.repoId === selectedRepoId)) return;
    setSelectedRepoId("all");
  }, [groups, selectedRepoId, state.status, setSelectedRepoId]);

  // B3: focus de cockpit bij mount en na het sluiten van de settings-sheet
  // of het sortmenu, zodat pijltjes direct werken zonder eerste muisklik.
  useEffect(() => {
    cockpitRef.current?.focus();
  }, []);
  useEffect(() => {
    if (!settingsOpen) cockpitRef.current?.focus();
  }, [settingsOpen]);
  useEffect(() => {
    if (!sortOpen) cockpitRef.current?.focus();
  }, [sortOpen]);
  // U6: focus keert na het sluiten van het contextmenu terug naar de
  // cockpit-container, die de lijst-shortcuts al vangt.
  useEffect(() => {
    if (contextMenu == null) cockpitRef.current?.focus();
  }, [contextMenu]);
  // U8/B3-regressie: de sneltoetsen-hulp sluit via backdrop-klik zonder dat
  // activeElement teruggaat naar de cockpit, waardoor de pijltjes dood
  // blijven tot een toevallige rerender; dit herstelt 'm net als hierboven.
  useEffect(() => {
    if (!helpOpen) cockpitRef.current?.focus();
  }, [helpOpen]);

  const scopedPrs = useMemo(
    () =>
      selectedRepoId === "all"
        ? prs
        : prs.filter((pr) => pr.repoId === selectedRepoId),
    [prs, selectedRepoId],
  );
  const sortCtx = useMemo<SortCtx>(() => {
    const stackInfoByKeyForSort = new Map(
      computeStackInfo(prs).map((info) => [
        `${info.repoId}#${info.number}`,
        info,
      ]),
    );
    return {
      isAgentBezig: (pr) => runningPrKeys.has(keyOfPr(pr)),
      isStackBlocked: (pr) =>
        (stackInfoByKeyForSort.get(keyOfPr(pr))?.blockedByPrNumbers.length ??
          0) > 0,
    };
  }, [prs, runningPrKeys]);
  const sections = useMemo(
    () => buildSections(scopedPrs, sortMode, sortCtx),
    [scopedPrs, sortMode, sortCtx],
  );
  // Kop tonen: in triage-modus altijd, in project-modus alleen als alle
  // repo's zichtbaar zijn (bij één geselecteerd project vervalt de kop).
  const sectionsForDisplay = useMemo(
    () =>
      sortMode === "project" && selectedRepoId !== "all"
        ? sections.map((section) => ({ ...section, titel: "" }))
        : sections,
    [sections, sortMode, selectedRepoId],
  );
  const visiblePrs = useMemo(
    () => sections.flatMap((section) => section.prs),
    [sections],
  );
  const {
    filteredPrs,
    selectedKey,
    selectedKeys,
    setSelectedKey,
    select,
    clearMultiSelection,
    selectAll,
    selectedPr,
    stackInfo,
    stackInfoByKey,
    stackChain,
    moveSelection,
  } = usePrSelection(prs, visiblePrs, search);
  // Eén afgeleide waarheid voor "de inspector is echt open": valt de
  // selectie weg terwijl `inspector` nog een tab-object heeft, dan mogen
  // sneltoetsen en de Escape-hiërarchie 'm niet als open behandelen (de
  // render-guard hierboven checkt dit al op beide velden).
  const inspectorOpen = inspector != null && selectedPr != null;
  // De inspector toont altijd de PR die geselecteerd was op het moment van
  // openen; verandert de selectie (pijltjes, klik, tray) terwijl hij al open
  // stond voor een andere key, dan zou hij anders een stale PR blijven
  // tonen. Een dubbelklik zet selectie én inspector in dezelfde tick op
  // dezelfde key, dus die opent hier niet zichzelf meteen weer dicht.
  useEffect(() => {
    setInspector((current) =>
      current != null && current.key !== selectedKey ? null : current,
    );
  }, [selectedKey]);
  const filteredKeys = useMemo(
    () => new Set(filteredPrs.map(keyOfPr)),
    [filteredPrs],
  );
  const visibleSections = useMemo(
    () =>
      sectionsForDisplay
        .map((section) => ({
          ...section,
          prs: section.prs.filter((pr) => filteredKeys.has(keyOfPr(pr))),
        }))
        .filter((section) => section.prs.length > 0),
    [sectionsForDisplay, filteredKeys],
  );

  // "Alles"-volgorde: alle PR's ongeacht de huidige sidebar-filter, want de
  // tray toont altijd het totaalbeeld.
  const allPrsSorted = useMemo(
    () => groups.flatMap((group) => group.prs),
    [groups],
  );
  useTraySync(allPrsSorted, refresh, setSelectedRepoId, setSelectedKey);

  // B5: sheet, sortmenu, contextmenu of de sneltoetsen-hulp open: dan mogen
  // M/R/⌘⏎ niet triggeren. Het merge-methode-/agent-modusmenu telt hier
  // bewust niet mee: die lokale menu-state leeft in MergeSection/
  // AgentButtons zelf, dus een hier op rendertijd gelezen DOM-check zou na
  // het sluiten van dat menu stil blijven hangen tot een toevallige rerender.
  // De live DOM-check op het moment van de toetsaanslag zit al in de
  // handlers (hieronder en in MergeSection).
  const shortcutsEnabled =
    computeShortcutsEnabled({
      settingsOpen,
      sortOpen,
      contextMenuOpen: contextMenu != null,
      menuOverlayOpen: false,
      inspectorOpen,
    }) && !helpOpen;

  // Window-brede shortcuts: cmd+F focust het zoekveld, cmd+R ververst, R
  // start een agent-review, ? toont de sneltoetsen-hulp, Escape leegt het
  // zoekveld. Los van de pijltjes/Enter-afhandeling hieronder, die alleen
  // binnen de lijst gelden.
  useEffect(() => {
    function handleWindowKeyDown(event: KeyboardEvent) {
      if (modKey(event) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        searchInputRef.current?.focus();
      } else if (modKey(event) && event.key.toLowerCase() === "r") {
        event.preventDefault();
        void refresh();
      } else if (modKey(event) && event.key === ",") {
        event.preventDefault();
        setSettingsOpen((open) => !open);
      } else if (event.key === "Escape") {
        // U8: de sneltoetsen-hulp sluit vóór al het andere.
        if (helpOpen) {
          setHelpOpen(false);
          return;
        }
        if (inspectorOpen) {
          setInspector(null);
          return;
        }
        if (contextMenu != null) {
          setContextMenu(null);
          return;
        }
        if (settingsOpen) {
          setSettingsOpen(false);
          return;
        }
        if (sortOpen) {
          setSortOpen(false);
          return;
        }
        if (selectedKeys.size > 1) {
          clearMultiSelection();
          return;
        }
        setSearch("");
        searchInputRef.current?.blur();
      } else if (
        event.key === "?" &&
        computeShortcutsEnabled({
          settingsOpen,
          sortOpen,
          contextMenuOpen: contextMenu != null,
          menuOverlayOpen: isAnyMenuOverlayOpen(document),
          inspectorOpen,
        }) &&
        !(
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(event.target.tagName)
        )
      ) {
        event.preventDefault();
        setHelpOpen((open) => !open);
      } else if (modKey(event) && event.key.toLowerCase() === "a") {
        // cmd+A selecteert alle zichtbare PR's, behalve als je in een
        // invoerveld typt (dan hoort select-all bij de tekst).
        if (
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(event.target.tagName)
        ) {
          return;
        }
        event.preventDefault();
        selectAll();
      } else if (modKey(event) && event.key in SORT_MODES_BY_DIGIT) {
        event.preventDefault();
        setSortMode(SORT_MODES_BY_DIGIT[event.key] as SortMode);
        setSortOpen(false);
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === "r" &&
        shortcutsEnabled &&
        !isAnyMenuOverlayOpen(document) &&
        !(
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(event.target.tagName)
        ) &&
        selectedPr != null &&
        !runningPrKeys.has(keyOfPr(selectedPr))
      ) {
        const agent = preferredReviewer(selectedPr.author);
        // U9: R deed hier eerder stilzwijgend niets; toon dezelfde reden als
        // het detailpaneel (DetailPanel.tsx, `disabledReason`).
        const reason = agentStartBlockedReason(
          agent,
          Boolean(clis[agent]),
          repoPaths[selectedPr.repoId],
        );
        if (reason != null) {
          showToast(reason, "fout");
          return;
        }
        event.preventDefault();
        void startRun(selectedPr, agent, settings.review.primaryMode).catch(
          (error: unknown) => {
            showToast(String(error), "fout");
          },
        );
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === "d" &&
        shortcutsEnabled &&
        !isAnyMenuOverlayOpen(document) &&
        !(
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(event.target.tagName)
        ) &&
        selectedPr != null
      ) {
        event.preventDefault();
        setInspector({ tab: "diff", key: keyOfPr(selectedPr) });
      }
    }
    window.addEventListener("keydown", handleWindowKeyDown);
    return () => window.removeEventListener("keydown", handleWindowKeyDown);
  }, [
    refresh,
    settingsOpen,
    sortOpen,
    helpOpen,
    inspectorOpen,
    contextMenu,
    selectedKeys,
    clearMultiSelection,
    selectAll,
    shortcutsEnabled,
    selectedPr,
    runningPrKeys,
    clis,
    repoPaths,
    startRun,
    settings.review.primaryMode,
    showToast,
    setSortMode,
  ]);

  // Ververst op het ingestelde interval (0 = handmatig); pauzeert als de app
  // op de achtergrond draait zodat een verborgen venster geen API-budget kost.
  useEffect(() => {
    if (settings.review.refreshMinutes === 0) return;
    const timer = setInterval(
      () => {
        if (document.hidden) return;
        void refresh();
      },
      settings.review.refreshMinutes * 60 * 1000,
    );
    return () => clearInterval(timer);
  }, [settings.review.refreshMinutes, refresh]);

  // Ververst als het venster weer zichtbaar wordt (venster sluiten = tab
  // verbergen, geen unmount), met een guard tegen te frequente refreshes.
  const lastVisibilityRefreshRef = useRef(0);
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) return;
      if (!shouldRefreshOnVisible(lastVisibilityRefreshRef.current, Date.now()))
        return;
      lastVisibilityRefreshRef.current = Date.now();
      void refresh();
    }
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () =>
      document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [refresh]);

  if (state.status === "loading") {
    return <div className="empty-state">Laden...</div>;
  }

  if (state.status === "error") {
    return (
      <div className="empty-state">
        <p>Fout: {state.message}</p>
        <button type="button" onClick={() => void refresh()}>
          Opnieuw proberen
        </button>
      </div>
    );
  }

  // Optimistisch schrijven; bij een fout blijft de oude waarde staan en
  // verschijnt de reden onder de segmented control (alleen voor de PR die
  // de mislukte write betrof).
  const priorityError =
    state.writeError?.scope === "priority" &&
    selectedPr != null &&
    state.writeError.prKey === keyOfPr(selectedPr)
      ? state.writeError.text
      : null;

  function handleSetPriority(
    repoId: RepoId,
    prNumber: PrNumber,
    priority: 1 | 2 | null,
  ) {
    void updatePriority(repoId, prNumber, priority)
      .then(() => {
        showToast(
          priority != null
            ? `Prioriteit ${priority === 1 ? "P1" : "P2"} gezet op #${prNumber}`
            : "Prioriteit verwijderd",
          "ok",
        );
      })
      .catch((error: unknown) => {
        showToast((error as Error).message, "fout");
      });
  }

  /** Prioriteit zetten op 1 of meerdere PR's: bij 1 dezelfde melding als
   * handleSetPriority, bij N>1 één samenvattende melding over de geslaagde
   * writes (fouten per PR blijven apart een toast tonen). */
  function handleSetPriorityBulk(
    targets: PullRequest[],
    priority: 1 | 2 | null,
  ) {
    if (targets.length === 1) {
      const [pr] = targets as [PullRequest];
      handleSetPriority(pr.repoId, pr.number, priority);
      return;
    }
    let succeeded = 0;
    void Promise.allSettled(
      targets.map((pr) =>
        updatePriority(pr.repoId, pr.number, priority)
          .then(() => {
            succeeded += 1;
          })
          .catch((error: unknown) => {
            showToast((error as Error).message, "fout");
          }),
      ),
    ).then(() => {
      if (succeeded === 0) return;
      showToast(
        priority != null
          ? `Prioriteit ${priority === 1 ? "P1" : "P2"} gezet op ${succeeded} PR's`
          : `Prioriteit verwijderd op ${succeeded} PR's`,
        "ok",
      );
    });
  }

  /** Gedeelde bulk-reviewlogica: filtert PR's zonder gekoppelde map of met
   * een lopende run, meldt hoeveel er gestart zijn én hoeveel overgeslagen
   * (U12: eerder meldde dit alleen de overgeslagen PR's). */
  /** Zonder `agent` kiest de kruisreview de reviewer per PR. */
  function startBulkRuns(
    bulkPrs: PullRequest[],
    mode: AgentMode,
    agent?: ReviewAgent,
  ) {
    let started = 0;
    let skipped = 0;
    for (const bulkPr of bulkPrs) {
      const repoPath = repoPaths[bulkPr.repoId];
      if (
        repoPath == null ||
        repoPath === "" ||
        runningPrKeys.has(keyOfPr(bulkPr))
      ) {
        skipped += 1;
        continue;
      }
      started += 1;
      void startRun(
        bulkPr,
        agent ?? preferredReviewer(bulkPr.author),
        mode,
      ).catch((error: unknown) => {
        showToast(String(error), "fout");
      });
    }
    if (started > 0 && skipped > 0) {
      showToast(
        `${started} gestart, ${skipped} overgeslagen (geen map of al bezig)`,
        "ok",
      );
    } else if (started > 0) {
      showToast(`${started} reviews gestart`, "ok");
    } else if (skipped > 0) {
      showToast(`${skipped} overgeslagen (geen map of al bezig)`, "fout");
    }
  }

  // ponytail: relatieve tijd wordt alleen op re-render berekend (bv. na een
  // refresh of interactie), geen aparte tick-timer; drift is verwaarloosbaar
  // voor een label als "2 min geleden".
  const lastUpdatedLabel =
    Date.now() - state.lastUpdated.getTime() < 60_000
      ? "zojuist"
      : `${formatRelative(state.lastUpdated.toISOString())} geleden`;

  // U11: een merge-fout heeft met de merge-knop al een zichtbare plek
  // (MergeSection toont 'm inline); die mag hier dus geen toast of banner
  // meer krijgen. De re-throw blijft staan: MergeSection's eigen .catch
  // vangt 'm daarmee op om de inline melding te zetten.
  function handleMergePr(pr: PullRequest, method: MergeMethod) {
    return mergePr(pr, method).then(() => {
      showToast(
        `${pr.repoId.split("/")[1]} #${pr.number} gemerged (${MERGE_METHOD_LABEL[method]})`,
        "ok",
      );
    });
  }

  return (
    // biome-ignore lint/a11y/noStaticElementInteractions: keyboard nav for the PR list
    <div
      ref={cockpitRef}
      className="cockpit"
      // biome-ignore lint/a11y/noNoninteractiveTabindex: keyboard nav for the PR list
      tabIndex={0}
      onKeyDown={(event) => {
        // Sheet/menu open: laat toetsen daar landen, niet in de PR-lijst.
        // (B5: sortmenu, contextmenu, het merge-methode-/agent-modusmenu en
        // de sneltoetsen-hulp tellen ook mee, de eerste twee via een live
        // DOM-check.)
        if (
          settingsOpen ||
          sortOpen ||
          contextMenu != null ||
          helpOpen ||
          inspectorOpen
        )
          return;
        if (isAnyMenuOverlayOpen(document)) return;
        if (
          event.target instanceof HTMLElement &&
          event.target.closest(".settings-sheet") != null
        ) {
          return;
        }
        // Typen in het zoekveld mag de selectie niet verplaatsen.
        if (event.target instanceof HTMLInputElement) return;
        if (event.key === "ArrowDown") {
          event.preventDefault();
          moveSelection(1, event.shiftKey);
          // Focus/selectie-desync: DOM-focus moet de selectie volgen, anders
          // herselecteert een latere Enter de rij die nog muis-focus had.
          cockpitRef.current?.focus();
        } else if (event.key === "ArrowUp") {
          event.preventDefault();
          moveSelection(-1, event.shiftKey);
          cockpitRef.current?.focus();
        } else if (event.key === "Enter" && selectedPr) {
          // Alleen afvangen als de cockpit-container zelf of een rij de
          // focus heeft; anders (bv. tab naar een knop elders in de app) mag
          // Enter het native knop-gedrag gewoon uitvoeren.
          if (
            event.target !== cockpitRef.current &&
            !(event.target as HTMLElement).closest?.(".pl-row")
          ) {
            return;
          }
          // Voorkomt dat de browser het native "Enter activeert de gefocuste
          // knop"-gedrag ook nog uitvoert (dat opende dan de oude, nog
          // gefocuste rij naast de hier geopende nieuwe selectie).
          event.preventDefault();
          void openUrl(selectedPr.url);
        }
      }}
    >
      <div className="cockpit-columns">
        <Sidebar
          groups={groups}
          totalCount={prs.length}
          selectedRepoId={selectedRepoId}
          onSelect={setSelectedRepoId}
          login={meLogin}
          clis={clis}
        />
        <div className="cockpit-main">
          <Toolbar
            search={search}
            onSearchChange={setSearch}
            searchInputRef={searchInputRef}
            onRefresh={() => void refresh()}
            refreshing={refreshing}
            lastUpdatedLabel={lastUpdatedLabel}
            resultCount={
              search.trim() !== ""
                ? { hits: filteredPrs.length, total: visiblePrs.length }
                : undefined
            }
            sortLabel={SORT_LABELS[sortMode]}
            onSortClick={() => setSortOpen((open) => !open)}
            sortMode={sortMode}
            sortOpen={sortOpen}
            onSelectSort={setSortMode}
            onCloseSort={() => setSortOpen(false)}
            onOpenSettings={() => setSettingsOpen(true)}
          />
          <div className="cockpit-panes">
            <div className="cockpit-list-column">
              {/* U11, foutkanaal-regel: een actie met een zichtbare plek
                  (de merge-knop, MergeSection) toont haar fout uitsluitend
                  inline daar; deze banner is voor de rest van writeError
                  (bv. de prioriteit-segmented control), zodat één fout nooit
                  op twee plekken tegelijk verschijnt. Agent-runfouten (start/
                  cancel) hebben hun eigen zichtbare knop en gaan daarom
                  uitsluitend via een toast (zie showToast-aanroepen verderop),
                  niet via deze banner. */}
              {state.writeError != null &&
                state.writeError.scope !== "merge" && (
                  <div className="cockpit-banner">
                    <AlertIcon size={13} className="cockpit-banner-icon" />
                    <div className="cockpit-banner-text">
                      {state.writeError.text}
                    </div>
                    <button
                      type="button"
                      className="cockpit-banner-dismiss"
                      onClick={clearWriteError}
                    >
                      <CloseIcon />
                    </button>
                  </div>
                )}
              {state.refreshError != null && (
                <div className="cockpit-banner">
                  <AlertIcon size={13} className="cockpit-banner-icon" />
                  <div className="cockpit-banner-text">
                    Verversen mislukt: {state.refreshError}
                  </div>
                  <button
                    type="button"
                    className="cockpit-banner-dismiss"
                    onClick={clearRefreshError}
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
              {state.truncated && (
                <div className="cockpit-banner">
                  <AlertIcon size={13} className="cockpit-banner-icon" />
                  <div className="cockpit-banner-text">
                    Lijst afgekapt op 100 per categorie: niet alles is
                    zichtbaar.
                  </div>
                </div>
              )}
              {selectedKeys.size > 1 && (
                <div className="pl-selection-chip mono">
                  {selectedKeys.size} geselecteerd
                  <button
                    type="button"
                    className="pl-selection-chip-close"
                    onClick={clearMultiSelection}
                    aria-label="Selectie opheffen"
                  >
                    <CloseIcon />
                  </button>
                </div>
              )}
              <PrList
                sections={visibleSections}
                stackInfoByKey={stackInfoByKey}
                selectedKey={selectedKey}
                selectedKeys={selectedKeys}
                onSelect={select}
                onRowDoubleClick={(key) => {
                  setInspector({ tab: "diff", key });
                }}
                onContextMenu={(key, event) => {
                  if (selectedKeys.has(key)) {
                    setContextMenu({
                      position: { x: event.clientX, y: event.clientY },
                      prKeys: [...selectedKeys],
                    });
                  } else {
                    select(key, { meta: false, shift: false });
                    setContextMenu({
                      position: { x: event.clientX, y: event.clientY },
                      prKeys: [key],
                    });
                  }
                }}
                showRepoMeta={selectedRepoId === "all"}
                runningPrKeys={runningPrKeys}
                hasActiveSearch={search.trim() !== ""}
              />
            </div>
            <DetailPanel
              pr={selectedPr}
              stackInfo={stackInfo}
              stackChain={stackChain}
              meLogin={meLogin}
              onSelectPr={setSelectedKey}
              onOpenInspector={(tab) => {
                if (selectedPr == null) return;
                setInspector({ tab, key: keyOfPr(selectedPr) });
              }}
              onSetPriority={handleSetPriority}
              priorityError={priorityError}
              onMergePr={handleMergePr}
              clis={clis}
              repoPath={selectedPr ? repoPaths[selectedPr.repoId] : undefined}
              run={selectedPr ? runForPr(prKeyOf(selectedPr)) : undefined}
              onStartRun={(pr, agent, mode) => {
                void startRun(pr, agent, mode).catch((error: unknown) => {
                  showToast(String(error), "fout");
                });
              }}
              onCancelRun={(runId) => {
                void cancelRun(runId).catch((error: unknown) => {
                  showToast(String(error), "fout");
                });
              }}
              onRepoLinked={refreshRepoPaths}
              settings={settings}
              // B4: filteredPrs (na zoekfilter), niet visiblePrs, anders telt
              // de bulkknop PR's die de zoekfilter verbergt.
              allPrs={filteredPrs}
              runningPrKeys={runningPrKeys}
              shortcutsEnabled={shortcutsEnabled}
              onOpenSettings={() => setSettingsOpen(true)}
              onBulkStart={(bulkPrs) =>
                startBulkRuns(bulkPrs, settings.review.primaryMode)
              }
              selectedCount={selectedKeys.size}
            />
          </div>
        </div>
      </div>
      <SettingsSheet
        open={settingsOpen}
        onClose={() => setSettingsOpen(false)}
        settings={settings}
        onUpdate={updateSettings}
        login={meLogin}
        onLogout={onLogout}
        repoIds={groups.map((group) => group.repoId)}
        repoPaths={repoPaths}
        onRepoLinked={refreshRepoPaths}
      />
      <Toast toasts={toasts} />
      <UpdateBanner
        state={update.state}
        onDismiss={update.dismiss}
        onInstall={() => {
          update.install().catch((error: Error) => {
            showToast(`Update mislukt: ${error.message}`, "fout");
          });
        }}
      />
      <ShortcutHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {inspector != null && selectedPr != null && (
        <PrInspector
          pr={selectedPr}
          initialTab={inspector.tab}
          onClose={() => setInspector(null)}
          onAuthError={onAuthError}
        />
      )}
      {contextMenu != null && (
        <PrContextMenu
          prs={contextMenu.prKeys
            .map((key) => filteredPrs.find((pr) => keyOfPr(pr) === key))
            .filter((pr): pr is PullRequest => pr != null)}
          position={contextMenu.position}
          onClose={() => setContextMenu(null)}
          onOpenOnGitHub={(prsToOpen) => {
            if (
              shouldConfirmBulkOpen(prsToOpen.length) &&
              !confirm(`${prsToOpen.length} tabs openen op GitHub?`)
            ) {
              return;
            }
            for (const pr of prsToOpen) void openUrl(pr.url);
          }}
          onStartReview={(prsToReview, mode, agent) =>
            startBulkRuns(prsToReview, mode, agent)
          }
          onSetPriority={handleSetPriorityBulk}
          mergeReasonsFor={(pr) =>
            mergeReasons(pr, stackInfoByKey.get(keyOfPr(pr)))
          }
          onMergeSingle={(pr) =>
            handleMergePr(pr, loadMethod()).catch((error: unknown) => {
              showToast((error as Error).message, "fout");
            })
          }
          runningPrKeys={runningPrKeys}
          onStopReview={(pr) => {
            const run = runForPr(prKeyOf(pr));
            if (run == null || run.status !== "running") return;
            void cancelRun(run.runId).catch((error: unknown) => {
              showToast(String(error), "fout");
            });
          }}
        />
      )}
    </div>
  );
}
