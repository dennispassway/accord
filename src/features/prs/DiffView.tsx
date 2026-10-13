import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, type ReactNode, useId, useMemo, useState } from "react";
import type { ReviewThread } from "../../lib/github/prDetail";
import { type ThreadActions, ThreadList } from "./CommentsView";
import type { DiffViewMode } from "./cockpitPrefs";
import {
  buildUnifiedItems,
  contiguousRuns,
  countChanges,
  EXPAND_ALL_MAX,
  EXPAND_STEP,
  type Expansion,
  expandContext,
  fileStatus,
  type HiddenRange,
  hiddenAbove,
  hiddenBelow,
  isGeneratedPath,
  type LineNumbers,
  lineKey,
  matchesFile,
  placeThreads,
  type UnifiedHunk,
  type UnifiedItem,
  type UnifiedRow,
} from "./diffModel";
import type { DiffFile } from "./diffParse";
import {
  type SplitItem,
  type SplitRow,
  splitFromUnified,
  wordSegments,
} from "./diffSplit";
import { escapeHtml, highlightRows, markWords } from "./highlight";
import "./inspector.css";
import type { Segment } from "./wordDiff";

interface DiffViewProps extends ThreadActions {
  files: DiffFile[];
  tooLarge: boolean;
  url: string;
  mode: DiffViewMode;
  threadsByPath: ReadonlyMap<string, ReviewThread[]>;
  /** Regels van een bestand op de head-commit; afwezig = geen uitklappen. */
  loadFileLines?: (path: string) => Promise<string[]>;
  /** Laadt de diff per bestand als GitHub de hele diff weigert. */
  onLoadPerFile?: () => Promise<void>;
}

function threadCount(count: number): string {
  return count === 1 ? "1 thread" : `${count} threads`;
}

function OutdatedBlock({
  threads,
  ...actions
}: { threads: ReviewThread[] } & ThreadActions) {
  const [shown, setShown] = useState(false);
  const panelId = useId();
  return (
    <div className="inspector-diff-outdated">
      <div className="inspector-diff-outdated-head">
        <span>
          {threadCount(threads.length)} niet bij een regel in deze diff
        </span>
        <button
          type="button"
          className="inspector-thread-action"
          aria-expanded={shown}
          aria-controls={panelId}
          onClick={() => setShown(!shown)}
        >
          {shown ? "Threads verbergen" : "Threads tonen"}
        </button>
      </div>
      {shown && (
        <div id={panelId}>
          <ThreadList threads={threads} showLocation {...actions} />
        </div>
      )}
    </div>
  );
}

interface ViewRow {
  key: string;
  numbers: LineNumbers;
  node: ReactNode;
}

const NO_NUMBERS: LineNumbers = { oldNo: null, newNo: null };

/** Highlight-html en woordmarkering per regel, gesleuteld met `lineKey`. */
interface Marks {
  html: ReadonlyMap<string, string | null>;
  words: ReadonlyMap<string, Segment[]>;
}

function marksFor(items: readonly UnifiedItem[], path: string): Marks {
  const html = new Map<string, string | null>();
  // Per aaneengesloten reeks: een open commentaar of template literal mag niet
  // doorlekken naar een hunk verderop, en de limieten gelden per reeks.
  for (const run of contiguousRuns(items)) {
    highlightRows(run, path).forEach((markup, i) => {
      const row = run[i];
      if (row) html.set(lineKey(row.type, row.oldNo, row.newNo), markup);
    });
  }
  return { html, words: wordSegments(items) };
}

function Cell({
  kind,
  text,
  markKey,
  marks,
}: {
  kind: string;
  text: string;
  markKey: string | null;
  marks: Marks;
}) {
  const className = `inspector-diff-cell inspector-diff-cell-${kind}`;
  const html = markKey === null ? null : (marks.html.get(markKey) ?? null);
  const segments = markKey === null ? undefined : marks.words.get(markKey);
  // Alleen html uit highlightRows (highlight.js escapet de tekst, getest in
  // highlight.test.ts) of uit escapeHtml komt hier in; nooit rauwe difftekst.
  const markup = segments
    ? markWords(html ?? escapeHtml(text), segments)
    : html;
  if (markup === null) return <span className={className}>{text}</span>;
  return (
    <span
      className={className}
      // biome-ignore lint/security/noDangerouslySetInnerHtml: zie de comment hierboven, de html is ge-escaped
      dangerouslySetInnerHTML={{ __html: markup }}
    />
  );
}

/** Het gat boven hunk `n` of onder het laatste hunk (`"below"`). */
type Target = number | "below";

interface ExpandAction {
  label: string;
  name: string;
  count: number;
}

/** Wat er in een gat te doen is: een stap, en alles tot een bovengrens. */
function expandActions(
  arrow: "↑" | "↓",
  where: "boven" | "onder",
  remaining: number | null,
): ExpandAction[] {
  const name = (count: number) => `${plural(count)} ${where} dit blok tonen`;
  if (remaining !== null && remaining <= EXPAND_STEP) {
    return [
      {
        label: `${arrow} ${plural(remaining)} tonen`,
        name: name(remaining),
        count: remaining,
      },
    ];
  }
  const step = {
    label:
      remaining === null
        ? `${arrow} ${EXPAND_STEP} regels`
        : `${arrow} ${EXPAND_STEP} van ${remaining} regels`,
    name: name(EXPAND_STEP),
    count: EXPAND_STEP,
  };
  const all = Math.min(remaining ?? EXPAND_ALL_MAX, EXPAND_ALL_MAX);
  const everything = {
    label:
      remaining === null
        ? `Tot ${EXPAND_ALL_MAX} regels tonen`
        : remaining <= EXPAND_ALL_MAX
          ? "Alles tonen"
          : `${all} regels tonen`,
    name: `${remaining === null ? "Rest van het bestand" : plural(all)} ${where} dit blok tonen`,
    count: all,
  };
  return [step, everything];
}

interface Expand {
  target: Target;
  actions: ExpandAction[];
}

type LoadState = {
  target: Target;
  count: number;
  /** `fetch` mislukt, of `stale`: het bestand wijkt af van de diff. */
  failed: false | "fetch" | "stale";
};

function ExpandControl({
  expand,
  load,
  onExpand,
}: {
  expand: Expand;
  load: LoadState | null;
  onExpand: (target: Target, count: number) => void;
}) {
  const mine = load?.target === expand.target ? load : null;
  if (load?.failed === "stale") {
    // Het bestand wijkt af van de diff: nergens in dit bestand meer uitklappen.
    return mine ? (
      <span className="inspector-diff-expand-error" role="status">
        Bestand gewijzigd, ververs de PR
      </span>
    ) : null;
  }
  if (mine?.failed === "fetch") {
    return (
      <>
        <span className="inspector-diff-expand-error" role="status">
          Laden mislukt
        </span>
        <button
          type="button"
          className="inspector-thread-action inspector-diff-expand"
          onClick={() => onExpand(mine.target, mine.count)}
        >
          Opnieuw
        </button>
      </>
    );
  }
  if (mine !== null) {
    return (
      <button
        type="button"
        className="inspector-thread-action inspector-diff-expand"
        disabled
      >
        Laden…
      </button>
    );
  }
  return (
    <>
      {expand.actions.map((action) => (
        <button
          key={action.label}
          type="button"
          className="inspector-thread-action inspector-diff-expand"
          aria-label={action.name}
          disabled={load !== null && load.failed === false}
          onClick={() => onExpand(expand.target, action.count)}
        >
          {action.label}
        </button>
      ))}
    </>
  );
}

function hunkRow(item: UnifiedHunk, control: ReactNode): ViewRow {
  return {
    key: `h${item.oldStart}-${item.newStart}`,
    numbers: NO_NUMBERS,
    node: (
      <div className="inspector-diff-line-hunk">
        {control}
        <span>
          {item.context !== ""
            ? item.context
            : `@@ -${item.oldStart} +${item.newStart} @@`}
        </span>
      </div>
    ),
  };
}

function footRow(control: ReactNode): ViewRow {
  return {
    key: "foot",
    numbers: NO_NUMBERS,
    node: <div className="inspector-diff-line-hunk">{control}</div>,
  };
}

function unifiedRow(item: UnifiedRow, marks: Marks): ViewRow {
  const markKey = lineKey(item.type, item.oldNo, item.newNo);
  return {
    key: `${item.oldNo ?? ""}-${item.newNo ?? ""}`,
    numbers: { oldNo: item.oldNo, newNo: item.newNo },
    node: (
      <div className="inspector-diff-row">
        <span className="inspector-diff-lineno">{item.oldNo ?? ""}</span>
        <span className="inspector-diff-lineno">{item.newNo ?? ""}</span>
        <Cell
          kind={item.type}
          text={item.text}
          markKey={markKey}
          marks={marks}
        />
      </div>
    ),
  };
}

function splitMarkKey(
  cell: SplitRow["left"],
  newNo: number | null,
): string | null {
  if (cell.kind === "empty") return null;
  return cell.kind === "del"
    ? lineKey("del", cell.lineNo, null)
    : lineKey(cell.kind, null, newNo);
}

function splitRow({ left, right }: SplitRow, marks: Marks): ViewRow {
  return {
    key: `${left.lineNo ?? ""}-${right.lineNo ?? ""}`,
    numbers: { oldNo: left.lineNo, newNo: right.lineNo },
    node: (
      <div className="inspector-diff-row">
        <span className="inspector-diff-lineno">{left.lineNo ?? ""}</span>
        <Cell
          kind={left.kind}
          text={left.text}
          markKey={splitMarkKey(left, right.lineNo)}
          marks={marks}
        />
        <span className="inspector-diff-lineno">{right.lineNo ?? ""}</span>
        <Cell
          kind={right.kind}
          text={right.text}
          markKey={splitMarkKey(right, right.lineNo)}
          marks={marks}
        />
      </div>
    ),
  };
}

function plural(count: number): string {
  return count === 1 ? "1 regel" : `${count} regels`;
}

function size(range: HiddenRange): number {
  return range.newTo - range.newFrom + 1;
}

/** Zonder bekende bestandslengte geeft `hiddenBelow` met deze waarde alleen
 * aan of er ruimte onder het laatste hunk is; het aantal is dan nog onbekend. */
const UNKNOWN_LENGTH = Number.MAX_SAFE_INTEGER;

const NO_EXPANSION: Expansion = { above: new Map(), below: 0 };

function FileBody({
  file,
  mode,
  threads,
  id,
  loadFileLines,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  id: string;
  loadFileLines?: (path: string) => Promise<string[]>;
} & ThreadActions) {
  const unified = useMemo(() => buildUnifiedItems(file.lines), [file.lines]);
  const [lines, setLines] = useState<string[] | null>(null);
  const [expansion, setExpansion] = useState(NO_EXPANSION);
  const [load, setLoad] = useState<LoadState | null>(null);

  const gaps = useMemo(() => {
    if (loadFileLines === undefined) return { above: [], below: null };
    const hunks = unified.filter((i) => i.kind === "hunk").length;
    return {
      above: Array.from({ length: hunks }, (_, i) => hiddenAbove(unified, i)),
      below: hiddenBelow(unified, lines?.length ?? UNKNOWN_LENGTH),
    };
  }, [loadFileLines, unified, lines]);

  const visible = useMemo(
    () => (lines === null ? unified : expandContext(unified, lines, expansion)),
    [unified, lines, expansion],
  );
  const marks = useMemo(
    () => marksFor(visible, file.path),
    [visible, file.path],
  );

  function reveal(target: Target, count: number) {
    setExpansion((prev) =>
      target === "below"
        ? { ...prev, below: prev.below + count }
        : {
            ...prev,
            above: new Map(prev.above).set(
              target,
              (prev.above.get(target) ?? 0) + count,
            ),
          },
    );
  }

  async function expand(target: Target, count: number) {
    if (lines !== null) {
      reveal(target, count);
      return;
    }
    if (loadFileLines === undefined) return;
    setLoad({ target, count, failed: false });
    try {
      const loaded = await loadFileLines(file.path);
      // Klopt het bestand niet meer met de diff, dan staat de context op de
      // verkeerde regels: dan niets invoegen.
      if (!matchesFile(unified, loaded)) {
        setLoad({ target, count, failed: "stale" });
        return;
      }
      setLines(loaded);
      reveal(target, count);
      setLoad(null);
    } catch {
      setLoad({ target, count, failed: "fetch" });
    }
  }

  const control = (target: Target, actions: ExpandAction[]) => (
    <ExpandControl
      expand={{ target, actions }}
      load={load}
      onExpand={(t, count) => void expand(t, count)}
    />
  );

  const items: readonly (UnifiedItem | SplitItem)[] =
    mode === "unified" ? visible : splitFromUnified(visible);
  let hunkIndex = -1;
  const rows: ViewRow[] = items.map((item) => {
    if (item.kind === "hunk") {
      hunkIndex++;
      const range = gaps.above[hunkIndex];
      const remaining = range
        ? size(range) - (expansion.above.get(hunkIndex) ?? 0)
        : 0;
      return hunkRow(
        item,
        remaining > 0
          ? control(hunkIndex, expandActions("↑", "boven", remaining))
          : null,
      );
    }
    return "left" in item ? splitRow(item, marks) : unifiedRow(item, marks);
  });
  if (gaps.below !== null) {
    const remaining =
      lines === null ? null : size(gaps.below) - expansion.below;
    const hidden = load?.failed === "stale" && load.target !== "below";
    if (!hidden && (remaining === null || remaining > 0)) {
      rows.push(
        footRow(control("below", expandActions("↓", "onder", remaining))),
      );
    }
  }

  const placed = placeThreads(
    rows.map((row) => row.numbers),
    threads,
  );
  const status = fileStatus(file.lines);

  return (
    <div id={id}>
      {status !== null ? (
        <p className="inspector-diff-file-note">{status}</p>
      ) : (
        <div className="inspector-diff-lines">
          <div className={`inspector-diff-grid inspector-diff-grid-${mode}`}>
            {rows.map((row, index) => {
              const here = placed.atRow.get(index);
              return (
                <Fragment key={row.key}>
                  {row.node}
                  {here && (
                    <div className="inspector-diff-thread-row">
                      <ThreadList
                        threads={here}
                        showLocation={false}
                        showSide={mode === "split"}
                        {...actions}
                      />
                    </div>
                  )}
                </Fragment>
              );
            })}
          </div>
        </div>
      )}
      {placed.outdated.length > 0 && (
        <OutdatedBlock threads={placed.outdated} {...actions} />
      )}
    </div>
  );
}

function FileDiff({
  file,
  mode,
  threads,
  loadFileLines,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  loadFileLines?: (path: string) => Promise<string[]>;
} & ThreadActions) {
  const generated = isGeneratedPath(file.path);
  const unresolved = threads.filter((t) => !t.isResolved).length;
  // Een gegenereerd bestand met een open thread mag niet verborgen blijven.
  const [open, setOpen] = useState(!generated || unresolved > 0);
  const bodyId = useId();
  const { add, del } = countChanges(file.lines);
  const slash = file.path.lastIndexOf("/");
  const dir = slash === -1 ? "" : file.path.slice(0, slash + 1);
  const name = file.path.slice(slash + 1);

  return (
    <section className="inspector-diff-file">
      <button
        type="button"
        className="inspector-diff-file-head"
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen(!open)}
      >
        <span
          className={
            open ? "inspector-diff-chevron open" : "inspector-diff-chevron"
          }
          aria-hidden="true"
        >
          ›
        </span>
        <span className="inspector-diff-file-path">
          <span className="inspector-diff-file-dir">{dir}</span>
          {name}
        </span>
        {generated && (
          <span className="inspector-diff-generated">gegenereerd</span>
        )}
        {threads.length > 0 && (
          <span
            className="inspector-diff-file-threads"
            title={`${unresolved} van ${threadCount(threads.length)} onopgelost`}
          >
            {unresolved}/{threads.length} open
          </span>
        )}
        <span className="inspector-diff-file-count">
          <span className="inspector-diff-add">+{add}</span>{" "}
          <span className="inspector-diff-del">−{del}</span>
        </span>
      </button>
      {open && (
        <FileBody
          file={file}
          mode={mode}
          threads={threads}
          id={bodyId}
          loadFileLines={loadFileLines}
          {...actions}
        />
      )}
    </section>
  );
}

function TooLarge({
  url,
  onLoadPerFile,
}: {
  url: string;
  onLoadPerFile?: () => Promise<void>;
}) {
  const [state, setState] = useState<
    { status: "idle" | "loading" } | { status: "failed"; message: string }
  >({ status: "idle" });
  async function load() {
    if (onLoadPerFile === undefined) return;
    setState({ status: "loading" });
    try {
      await onLoadPerFile();
    } catch (error) {
      setState({ status: "failed", message: (error as Error).message });
    }
  }

  return (
    <div className="inspector-empty">
      <p>Deze diff is te groot voor GitHub's API.</p>
      {state.status === "failed" && (
        <p role="status">Laden mislukt: {state.message}</p>
      )}
      <div className="inspector-error-actions">
        {onLoadPerFile && (
          <button
            type="button"
            className="inspector-github-button"
            disabled={state.status === "loading"}
            onClick={() => void load()}
          >
            {state.status === "loading"
              ? "Bestanden laden…"
              : state.status === "failed"
                ? "Opnieuw"
                : "Per bestand laden"}
          </button>
        )}
        <button
          type="button"
          className="inspector-github-button"
          onClick={() => void openUrl(url)}
        >
          Open op GitHub
        </button>
      </div>
    </div>
  );
}

export function DiffView({
  files,
  tooLarge,
  url,
  mode,
  threadsByPath,
  loadFileLines,
  onLoadPerFile,
  ...actions
}: DiffViewProps) {
  if (tooLarge) {
    return <TooLarge url={url} onLoadPerFile={onLoadPerFile} />;
  }

  if (files.length === 0) {
    return (
      <div className="inspector-empty">
        <p>Geen diff gevonden.</p>
      </div>
    );
  }

  return (
    <div className="inspector-diff">
      {files.map((file) => (
        <FileDiff
          key={file.path}
          file={file}
          mode={mode}
          threads={threadsByPath.get(file.path) ?? []}
          loadFileLines={loadFileLines}
          {...actions}
        />
      ))}
    </div>
  );
}
