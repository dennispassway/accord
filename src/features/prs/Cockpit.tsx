import { openUrl } from "@tauri-apps/plugin-opener";
import type { CSSProperties } from "react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  branchesToResolve,
  planStackRebase,
  rebaseStackBranch,
  resolveBranchShas,
} from "../../lib/github/autoRebase";
import type { PullRequest, RepoId } from "../../lib/github/domain";
import type { MergeMethod } from "../../lib/github/merge";
import { mergeReasons } from "../../lib/github/merge";
import { groupByRepo } from "../../lib/github/organize";
import type { ReviewEvent } from "../../lib/github/review";
import { computeStackInfo } from "../../lib/github/stacks";
import { decideNotification } from "../../lib/notifications";
import {
  listenForNotificationClicks,
  logSuppressedNotification,
  sendAppNotification,
} from "../../lib/notify";
import { modKey } from "../../lib/platform";
import { useSettings } from "../../lib/settings";
import { useWindowFocused } from "../../lib/windowFocus";
import type { AgentMode, ReviewAgent } from "../agents/crossReview";
import { chainsIntoLearnings, preferredReviewer } from "../agents/crossReview";
import { prKeyOf, useAgentRuns } from "../agents/useAgentRuns";
import { SettingsSheet } from "../settings/SettingsSheet";
import { UpdateBanner } from "../update/UpdateBanner";
import { useUpdate } from "../update/useUpdate";
import "./contextmenu.css";
import { MODE_LABEL } from "./AgentButtons";
import {
  loadRepoFilter,
  loadSortMode,
  saveRepoFilter,
  saveSortMode,
} from "./cockpitPrefs";
import { DetailPanel } from "./DetailPanel";
import { formatRelative, formatSnoozeUntil } from "./format";
import { AlertIcon, CloseIcon } from "./icons";
import { isTypingTarget, listKeyToMove } from "./listKeyToMove";
import { loadMethod } from "./MergeSection";
import { isAnyMenuOverlayOpen } from "./menuOverlay";
import { PrContextMenu } from "./PrContextMenu";
import { PrInspector } from "./PrInspector";
import { keyOfPr, PrList } from "./PrList";
import { PANEL_BOUNDS } from "./panelLayout";
import { ResizeHandle } from "./ResizeHandle";
import { prStatus } from "./rank";
import { refreshIntervalMs } from "./refreshPolicy";
import { ShortcutHelp } from "./ShortcutHelp";
import { Sidebar } from "./Sidebar";
import type { StackRebaseStatus } from "./StackRail";
import {
  isSnoozed,
  loadSnoozes,
  pruneSnoozes,
  type SnoozeStore,
  saveSnoozes,
  tomorrowAt9,
} from "./snooze";
import type { SortCtx, SortMode } from "./sort";
import { buildSections } from "./sort";
import { Toast, useToast } from "./Toast";
import { Toolbar } from "./Toolbar";
import { usePanelWidths } from "./usePanelWidths";
import { usePrSelection } from "./usePrSelection";
import { shouldRefreshOnVisible, usePrs } from "./usePrs";
import { useTraySync } from "./useTraySync";
import { visibleSectionsFor } from "./visibleSections";

const MERGE_METHOD_LABEL: Record<MergeMethod, string> = {
  SQUASH: "squash",
  MERGE: "merge commit",
};

const SORT_MODES_BY_DIGIT: Record<string, SortMode> = {
  "1": "triage",
  "2": "bijgewerkt",
  "3": "oudste",
  "4": "omvang",
  "5": "project",
};

const SORT_LABELS: Record<SortMode, string> = {
  triage: "Triage",
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
  const { toasts, showToast } = useToast();
  const { settings, update: updateSettings } = useSettings();
  const windowFocused = useWindowFocused();
  // SHOULD-fix: de decideNotification-check bij een merge draait pas ná de
  // merge-call, dus ruim na de render waarop de knop geklikt
  // werd; een direct gesloten `{ enabled: settings.notifications,
  // windowFocused }` blijft dan vastzitten op de waarden van dat
  // klik-moment. Eén ref die elke render bijwerkt en die alle drie de
  // triggers (run, CI, merge) uitlezen, geeft altijd de actuele waarden.
  const notifyContextRef = useRef({
    enabled: settings.notifications,
    windowFocused,
  });
  notifyContextRef.current = {
    enabled: settings.notifications,
    windowFocused,
  };
  const {
    state,
    refresh,
    mergePr,
    submitReview,
    clearRefreshError,
    refreshing,
  } = usePrs(onAuthError, (flippedPrs) => {
    // U: CI-omslag naar rood op een eigen PR, gedetecteerd bij deze refresh
    // (usePrs' snapshotvergelijking); alleen zichtbaar als het venster niet
    // gefocust is (zie decideNotification), anders ziet de gebruiker het al
    // in de lijst zelf.
    for (const pr of flippedPrs) {
      const payload = decideNotification(
        {
          type: "ciFlippedRed",
          prKey: keyOfPr(pr),
          prNumber: pr.number,
          repoName: pr.repoId,
        },
        notifyContextRef.current,
      );
      if (payload != null) void sendAppNotification(payload);
      else logSuppressedNotification(notifyContextRef.current);
    }
  });
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
    // U3: de toast noemt de modus die echt draaide in plaats van altijd
    // "Review", zodat een fix-, checks- of conflict-run herkenbaar is.
    showToast(
      status === "done"
        ? `${MODE_LABEL[mode]} klaar: #${number}`
        : `${MODE_LABEL[mode]} mislukt: #${number}`,
      status === "done" ? "ok" : "fout",
    );
    // Comment-/fix-commit-aantallen komen pas via GitHub binnen (agentReviews
    // op de PR, ná de refresh hieronder) en zijn hier nog niet bekend: de
    // tekst laat ze daarom weg (zie decideNotification/runFinishedBody).
    const notifyPayload = decideNotification(
      {
        type: "runFinished",
        agent,
        prKey,
        prNumber: Number(number),
        status,
      },
      notifyContextRef.current,
    );
    if (notifyPayload != null) void sendAppNotification(notifyPayload);
    else logSuppressedNotification(notifyContextRef.current);
    void refresh();
    // Lessen structureel: na een geslaagde run die fixes toepaste destilleert
    // dezelfde agent automatisch de lessen, inline op de PR-branch zelf (een
    // aparte lessen-PR is er alleen via de handmatige actie); de prompt stopt
    // zelf als er geen generaliseerbare les in de comments zit.
    if (
      status === "done" &&
      settings.review.autoDistillLearnings &&
      chainsIntoLearnings(mode)
    ) {
      const pr = prs.find((candidate) => keyOfPr(candidate) === prKey);
      if (pr != null) {
        showToast(`Lessen vastleggen gestart: #${number}`, "ok");
        void startRun(pr, agent, "distillLearningsInline").catch(
          (error: unknown) => {
            showToast(String(error), "fout");
          },
        );
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
  const [laterCollapsed, setLaterCollapsed] = useState(true);
  const [snoozeStoreState, setSnoozeStoreState] =
    useState<SnoozeStore>(loadSnoozes);
  const setSnoozeStore = useCallback(
    (updater: (current: SnoozeStore) => SnoozeStore) => {
      setSnoozeStoreState((current) => {
        const next = updater(current);
        saveSnoozes(next);
        return next;
      });
    },
    [],
  );
  // Minuten-tick: een snooze mag ook tot leven komen zonder dat de gebruiker
  // intussen iets anders doet dat een re-render triggert.
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(timer);
  }, []);
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
  const [stackRebaseStatus, setStackRebaseStatus] =
    useState<StackRebaseStatus | null>(null);
  const { panels, resize, commit, reset } = usePanelWidths();

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
  const sectionKeyOf = useCallback(
    (pr: PullRequest) =>
      prStatus(pr, {
        agentBezig: sortCtx.isAgentBezig(pr),
        stackBlocked: sortCtx.isStackBlocked(pr),
      }).key,
    [sortCtx],
  );
  const snoozeUntilOf = useCallback(
    (pr: PullRequest): string | undefined => {
      const entry = snoozeStoreState[keyOfPr(pr)];
      if (entry == null) return undefined;
      return isSnoozed(entry, pr, sectionKeyOf(pr), now)
        ? entry.until
        : undefined;
    },
    [snoozeStoreState, sectionKeyOf, now],
  );
  // Alleen aanroepen met de volledige, ongefilterde lijst (organize.ts'
  // groepering, niet scopedPrs): pruneSnoozes moet ook een PR zien die de
  // repo-/zoekfilter net verbergt, anders verwijdert een filter per ongeluk
  // een nog geldige snooze.
  // F4: niet prunen op de koude-start snapshot (kan een intussen gemergede
  // of gesloten PR nog bevatten) of op een afgekapte fetch (dan ontbreekt
  // een deel van de echte lijst, en zou pruneSnoozes een geldige snooze
  // aanzien voor "PR niet meer gevonden").
  const canPruneSnoozes =
    state.status === "ready" && !state.fromSnapshot && !state.truncated;
  useEffect(() => {
    if (!canPruneSnoozes) return;
    setSnoozeStore((current) => pruneSnoozes(current, prs, sectionKeyOf, now));
  }, [prs, sectionKeyOf, now, canPruneSnoozes, setSnoozeStore]);
  const handleSnooze = useCallback(
    (prsToSnooze: PullRequest[], until: Date) => {
      const untilIso = until.toISOString();
      setSnoozeStore((current) => {
        const next = { ...current };
        for (const pr of prsToSnooze) {
          next[keyOfPr(pr)] = {
            until: untilIso,
            updatedAt: pr.updatedAt,
            sectionKey: sectionKeyOf(pr),
          };
        }
        return next;
      });
      const label = formatSnoozeUntil(untilIso, now);
      const first = prsToSnooze[0];
      if (prsToSnooze.length === 1 && first != null) {
        showToast(`#${first.number} staat op Later tot ${label}`, "ok");
      } else if (prsToSnooze.length > 1) {
        showToast(
          `${prsToSnooze.length} PR's staan op Later tot ${label}`,
          "ok",
        );
      }
    },
    [setSnoozeStore, sectionKeyOf, now, showToast],
  );
  const handleUnsnooze = useCallback(
    (prsToUnsnooze: PullRequest[]) => {
      setSnoozeStore((current) => {
        const next = { ...current };
        for (const pr of prsToUnsnooze) delete next[keyOfPr(pr)];
        return next;
      });
      const first = prsToUnsnooze[0];
      if (prsToUnsnooze.length === 1 && first != null) {
        showToast(`#${first.number} is terug`, "ok");
      } else if (prsToUnsnooze.length > 1) {
        showToast(`${prsToUnsnooze.length} PR's zijn terug`, "ok");
      }
    },
    [setSnoozeStore, showToast],
  );
  const sections = useMemo(
    () => buildSections(scopedPrs, sortMode, sortCtx, snoozeUntilOf),
    [scopedPrs, sortMode, sortCtx, snoozeUntilOf],
  );
  // Kop tonen: in triage-modus altijd, in project-modus alleen als alle
  // repo's zichtbaar zijn (bij één geselecteerd project vervalt de kop).
  // "Later" is geen projectkop maar een inklapknop: die houdt zijn label.
  const sectionsForDisplay = useMemo(
    () =>
      sortMode === "project" && selectedRepoId !== "all"
        ? sections.map((section) =>
            section.key === "later" ? section : { ...section, titel: "" },
          )
        : sections,
    [sections, sortMode, selectedRepoId],
  );
  // De ingeklapte "Later"-sectie telt niet mee voor toetsenbordnavigatie en
  // selectie: die rijen zijn niet zichtbaar.
  const visiblePrs = useMemo(
    () =>
      sections
        .filter((section) => !(section.key === "later" && laterCollapsed))
        .flatMap((section) => section.prs),
    [sections, laterCollapsed],
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
  // Klik op een systeemnotificatie: venster naar voren (notify.ts) en de PR
  // selecteren, zichtbaar ongeacht het huidige repo-filter of zoekterm.
  // Eenmalige registratie via een ref, want setSelectedKey/setSearch/
  // setSelectedRepoId zijn geen memoized functies en zouden anders elke
  // render opnieuw registreren.
  const selectFromNotificationRef = useRef((_prKey: string) => {});
  selectFromNotificationRef.current = (prKey: string) => {
    setSelectedRepoId("all");
    setSearch("");
    // F5: staat de doel-PR gesnoozed en "Later" ingeklapt, dan telt hij niet
    // mee voor visiblePrs en valt usePrSelection stilzwijgend terug op een
    // andere PR; klap "Later" dus eerst uit.
    const target = prs.find((pr) => keyOfPr(pr) === prKey);
    if (target != null && snoozeUntilOf(target) != null) {
      setLaterCollapsed(false);
    }
    setSelectedKey(prKey);
  };
  useEffect(() => {
    return listenForNotificationClicks((prKey) =>
      selectFromNotificationRef.current(prKey),
    );
  }, []);
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
  // F1: filtert elke sectie (óók "Later") rechtstreeks op de zoekopdracht,
  // los van laterCollapsed; filteredKeys (via visiblePrs) sloot ingeklapte
  // Later-rijen uit, waardoor de hele sectie hier leeg en dus onzichtbaar
  // werd zodra hij dicht stond, en een gesnoozede PR nergens meer te
  // bereiken was.
  const visibleSections = useMemo(
    () => visibleSectionsFor(sectionsForDisplay, search),
    [sectionsForDisplay, search],
  );

  // "Alles"-volgorde: alle PR's ongeacht de huidige sidebar-filter, want de
  // tray toont altijd het totaalbeeld.
  const allPrsSorted = useMemo(
    () => groups.flatMap((group) => group.prs),
    [groups],
  );
  // Zelfde secties als de lijst in "Alles"/triage, zodat het menubalkgetal
  // gelijk is aan de kop van "Jouw review nodig" (een lopende agent-run of
  // een concept telt daar niet mee).
  const trayReviewCount = useMemo(
    () =>
      buildSections(prs, "triage", sortCtx, snoozeUntilOf).find(
        (section) => section.key === "review",
      )?.prs.length ?? 0,
    [prs, sortCtx, snoozeUntilOf],
  );
  useTraySync(
    trayReviewCount,
    allPrsSorted,
    refresh,
    setSelectedRepoId,
    setSelectedKey,
    // F5: zelfde reden als selectFromNotificationRef hierboven, maar dan
    // voor een selectie vanuit het tray-menu.
    (pr) => {
      if (snoozeUntilOf(pr) != null) setLaterCollapsed(false);
    },
  );

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
        runningPrKeys.has(keyOfPr(selectedPr))
      ) {
        event.preventDefault();
        showToast(`Er loopt al een run op #${selectedPr.number}`, "fout");
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
      } else if (
        !event.metaKey &&
        !event.ctrlKey &&
        event.key.toLowerCase() === "l" &&
        shortcutsEnabled &&
        !isAnyMenuOverlayOpen(document) &&
        !(
          event.target instanceof HTMLElement &&
          ["INPUT", "TEXTAREA"].includes(event.target.tagName)
        ) &&
        selectedPr != null
      ) {
        event.preventDefault();
        const selectedPrs =
          selectedKeys.size > 1
            ? filteredPrs.filter((pr) => selectedKeys.has(keyOfPr(pr)))
            : [selectedPr];
        if (selectedPrs.every((pr) => snoozeUntilOf(pr) != null)) {
          handleUnsnooze(selectedPrs);
        } else {
          handleSnooze(selectedPrs, tomorrowAt9(now));
        }
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
    filteredPrs,
    snoozeUntilOf,
    now,
    handleSnooze,
    handleUnsnooze,
  ]);

  // Ververst op het ingestelde interval (0 = handmatig: nooit automatisch).
  // Blijft ook doorlopen als het venster verborgen is (menubalkmodus), met
  // een ruimer interval: anders verouderen de tellerbadge en de "CI is
  // rood"-notificatie precies wanneer de app op de achtergrond leeft.
  const [hidden, setHidden] = useState(() => document.hidden);
  useEffect(() => {
    function handleHiddenChange() {
      setHidden(document.hidden);
    }
    document.addEventListener("visibilitychange", handleHiddenChange);
    return () =>
      document.removeEventListener("visibilitychange", handleHiddenChange);
  }, []);

  useEffect(() => {
    const intervalMs = refreshIntervalMs({
      refreshMinutes: settings.review.refreshMinutes,
      hidden,
    });
    if (intervalMs === null) return;
    const timer = setInterval(() => void refresh(), intervalMs);
    return () => clearInterval(timer);
  }, [settings.review.refreshMinutes, hidden, refresh]);

  // Ververst als het venster weer zichtbaar wordt (venster sluiten = tab
  // verbergen, geen unmount), met een guard tegen te frequente refreshes.
  const lastVisibilityRefreshRef = useRef(0);
  useEffect(() => {
    function handleVisibilityChange() {
      if (document.hidden) return;
      if (
        !shouldRefreshOnVisible(lastVisibilityRefreshRef.current, Date.now(), {
          online: navigator.onLine,
        })
      )
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

  // Na een geslaagde merge rebaset dit de stapel erboven: eerst de sha's van
  // alle betrokken branches ophalen (vóór de merge, zodat "oude base" nog
  // klopt), dan mergen, dan per stap rebasen. Mislukt het ophalen van de
  // sha's, dan gaat de merge gewoon door zonder auto-rebase.
  async function mergeWithAutoRebase(pr: PullRequest, method: MergeMethod) {
    // Een geslaagde nieuwe run begint schoon; een conflictmelding van een
    // vorige run blijft anders staan (bewust, tot deze volgende poging).
    setStackRebaseStatus(null);
    const repoPathValue = repoPaths[pr.repoId];
    const repoPath =
      repoPathValue != null && repoPathValue !== "" ? repoPathValue : null;
    const steps =
      settings.autoRebaseStacks && repoPath != null
        ? planStackRebase(pr, prs)
        : [];
    let shas: Record<string, string> | null = null;
    if (steps.length > 0 && repoPath != null) {
      try {
        shas = await resolveBranchShas(repoPath, branchesToResolve(steps));
      } catch {
        shas = null;
      }
    }

    await mergePr(pr, method);
    showToast(
      `${pr.repoId.split("/")[1]} #${pr.number} gemerged (${MERGE_METHOD_LABEL[method]})`,
      "ok",
    );
    const notifyPayload = decideNotification(
      {
        type: "mergeCompleted",
        prKey: keyOfPr(pr),
        prNumber: pr.number,
        repoName: pr.repoId,
      },
      notifyContextRef.current,
    );
    if (notifyPayload != null) void sendAppNotification(notifyPayload);
    else logSuppressedNotification(notifyContextRef.current);

    // De gemergde PR verdwijnt meteen uit de lijst; stond die geselecteerd,
    // dan valt de selectie anders terug op de eerste zichtbare PR (mogelijk
    // buiten deze stapel) en verdwijnt de rebase-status uit beeld. Verhuis
    // de selectie naar de eerste stap, zodat de stapel-sectie in beeld blijft.
    if (
      steps.length > 0 &&
      selectedPr != null &&
      selectedPr.repoId === pr.repoId &&
      selectedPr.number === pr.number
    ) {
      const firstStep = steps[0];
      if (firstStep != null)
        setSelectedKey(`${pr.repoId}#${firstStep.prNumber}`);
    }

    if (shas == null || steps.length === 0 || repoPath == null) return;
    const resolvedShas = shas;
    const resolvedRepoPath = repoPath;
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      if (step == null) continue;
      setStackRebaseStatus({
        repoId: pr.repoId,
        prNumber: step.prNumber,
        label: `Stapel rebasen, stap ${i + 1} van ${steps.length}`,
        isError: false,
      });
      try {
        const result = await rebaseStackBranch(
          resolvedRepoPath,
          step.branch,
          resolvedShas[step.parentBranch] ?? "",
          resolvedShas[step.branch] ?? "",
          step.newBase,
        );
        if (result === "conflict") {
          setStackRebaseStatus({
            repoId: pr.repoId,
            prNumber: step.prNumber,
            label: `Rebase-conflict in #${step.prNumber}, los dit handmatig op`,
            isError: true,
          });
          showToast(
            `Rebase-conflict in #${step.prNumber}, los dit handmatig op`,
            "fout",
          );
          return;
        }
      } catch (error) {
        setStackRebaseStatus({
          repoId: pr.repoId,
          prNumber: step.prNumber,
          label: `Rebase van #${step.prNumber} mislukt: ${String(error)}`,
          isError: true,
        });
        showToast(`Rebase van #${step.prNumber} mislukt`, "fout");
        return;
      }
    }
    setStackRebaseStatus(null);
    void refresh();
  }

  // U11: een merge-fout heeft met de merge-knop al een zichtbare plek
  // (MergeSection toont 'm inline); die mag hier dus geen toast of banner
  // meer krijgen. De re-throw blijft staan: MergeSection's eigen .catch
  // vangt 'm daarmee op om de inline melding te zetten.
  function handleMergePr(pr: PullRequest, method: MergeMethod) {
    return mergeWithAutoRebase(pr, method);
  }

  const REVIEW_TOAST: Record<
    ReviewEvent,
    (n: PullRequest["number"]) => string
  > = {
    APPROVE: (n) => `#${n} goedgekeurd`,
    REQUEST_CHANGES: (n) => `Changes gevraagd op #${n}`,
    COMMENT: (n) => `Reactie geplaatst op #${n}`,
  };

  async function handleSubmitReview(
    pr: PullRequest,
    event: ReviewEvent,
    body: string,
  ) {
    await submitReview(pr, event, body);
    showToast(REVIEW_TOAST[event](pr.number), "ok");
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
        // F2: typen in het zoekveld óf in een textarea (bv. het
        // reactieveld van ReviewActions) mag de selectie niet verplaatsen;
        // "kijk" typen bevatte anders J/K en remountte het formulier.
        if (event.target instanceof HTMLElement && isTypingTarget(event.target))
          return;
        const move = listKeyToMove(event.key);
        if (move != null && !event.metaKey && !event.ctrlKey && !event.altKey) {
          event.preventDefault();
          moveSelection(move, event.shiftKey);
          // Focus/selectie-desync: DOM-focus moet de selectie volgen, anders
          // herselecteert een latere Enter de rij die nog muis-focus had.
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
      <div
        className="cockpit-columns"
        style={
          {
            "--sidebar-width": `${panels.sidebar}px`,
            "--detail-width": `${panels.detail}px`,
          } as CSSProperties
        }
      >
        <Sidebar
          groups={groups}
          totalCount={prs.length}
          selectedRepoId={selectedRepoId}
          onSelect={setSelectedRepoId}
          login={meLogin}
          clis={clis}
        />
        <ResizeHandle
          label="Breedte van de zijbalk"
          direction={1}
          width={panels.sidebar}
          min={PANEL_BOUNDS.sidebar.min}
          max={PANEL_BOUNDS.sidebar.max}
          onResize={(next) => resize("sidebar", next)}
          onCommit={(next) => commit("sidebar", next)}
          onReset={() => reset("sidebar")}
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
                snoozeUntilOf={snoozeUntilOf}
                laterCollapsed={laterCollapsed}
                onToggleLater={() =>
                  setLaterCollapsed((collapsed) => !collapsed)
                }
              />
            </div>
            <ResizeHandle
              label="Breedte van het detailpaneel"
              direction={-1}
              width={panels.detail}
              min={PANEL_BOUNDS.detail.min}
              max={PANEL_BOUNDS.detail.max}
              onResize={(next) => resize("detail", next)}
              onCommit={(next) => commit("detail", next)}
              onReset={() => reset("detail")}
            />
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
              onMergePr={handleMergePr}
              onSubmitReview={handleSubmitReview}
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
              onToggleAutoRebase={() =>
                updateSettings((s) => ({
                  ...s,
                  autoRebaseStacks: !s.autoRebaseStacks,
                }))
              }
              stackRebaseStatus={stackRebaseStatus}
              snoozeUntil={selectedPr ? snoozeUntilOf(selectedPr) : undefined}
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
            for (const pr of prsToOpen) void openUrl(pr.url);
          }}
          onStartReview={(prsToReview, mode, agent) =>
            startBulkRuns(prsToReview, mode, agent)
          }
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
          onSnooze={handleSnooze}
          onUnsnooze={handleUnsnooze}
          isSnoozed={(pr) => snoozeUntilOf(pr) != null}
        />
      )}
    </div>
  );
}
