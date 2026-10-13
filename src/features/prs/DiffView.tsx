import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Fragment,
  type ReactNode,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { ReviewThread } from "../../lib/github/prDetail";
import { type ThreadActions, ThreadList } from "./CommentsView";
import type { DiffViewMode } from "./cockpitPrefs";
import {
  buildUnifiedItems,
  countChanges,
  escapeHtml,
  expandContext,
  fileStatus,
  type HiddenRange,
  hiddenAbove,
  hiddenBelow,
  isGeneratedPath,
  type LineNumbers,
  lineKey,
  markWords,
  placeThreads,
  type UnifiedHunk,
  type UnifiedItem,
  type UnifiedRow,
  wordSegments,
} from "./diffModel";
import type { DiffFile } from "./diffParse";
import { type SplitItem, type SplitRow, splitFromUnified } from "./diffSplit";
import { highlightRows } from "./highlight";
import "./inspector.css";
import type { Segment } from "./wordDiff";

interface DiffViewProps extends ThreadActions {
  files: DiffFile[];
  tooLarge: boolean;
  url: string;
  mode: DiffViewMode;
  threadsByPath: ReadonlyMap<string, ReviewThread[]>;
  /** PR-sleutel plus head-commit: een andere waarde zet de lokale
   * uitklapstaat van elk bestand terug (zie async-antwoord-na-wissel.md). */
  subject?: string;
  headSha?: string;
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
  const rows = items.filter((i): i is UnifiedRow => i.kind === "row");
  const html = highlightRows(rows, path);
  return {
    html: new Map(
      rows.map((r, i) => [lineKey(r.type, r.oldNo, r.newNo), html[i] ?? null]),
    ),
    words: wordSegments(items),
  };
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

type ExpandStatus = "idle" | "loading" | "failed";

interface Expand {
  label: string;
  name: string;
  status: ExpandStatus;
  /** Een ander blok van dit bestand laadt al. */
  busy: boolean;
  onExpand: () => void;
}

function ExpandControl({ label, name, status, busy, onExpand }: Expand) {
  return (
    <>
      {status === "failed" && (
        <span className="inspector-diff-expand-error" role="status">
          Laden mislukt
        </span>
      )}
      <button
        type="button"
        className="inspector-thread-action inspector-diff-expand"
        aria-label={name}
        disabled={status === "loading" || busy}
        onClick={onExpand}
      >
        {status === "loading"
          ? "Laden…"
          : status === "failed"
            ? "Opnieuw"
            : label}
      </button>
    </>
  );
}

function hunkRow(item: UnifiedHunk, expand: Expand | null): ViewRow {
  return {
    key: `h${item.oldStart}-${item.newStart}`,
    numbers: NO_NUMBERS,
    node: (
      <div className="inspector-diff-line-hunk">
        {expand && <ExpandControl {...expand} />}
        <span>
          {item.context !== ""
            ? item.context
            : `@@ -${item.oldStart} +${item.newStart} @@`}
        </span>
      </div>
    ),
  };
}

function footRow(expand: Expand): ViewRow {
  return {
    key: "foot",
    numbers: NO_NUMBERS,
    node: (
      <div className="inspector-diff-line-hunk">
        <ExpandControl {...expand} />
      </div>
    ),
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

/** Zonder bekende bestandslengte kan `hiddenBelow` nog geen aantal geven;
 * deze waarde laat hem alleen zeggen of er ruimte onder het laatste hunk is. */
const UNKNOWN_LENGTH = Number.MAX_SAFE_INTEGER;

const NO_HUNKS: ReadonlySet<number> = new Set();

function FileBody({
  file,
  mode,
  threads,
  id,
  headSha = "",
  loadFileLines,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  id: string;
  headSha?: string;
  loadFileLines?: (path: string) => Promise<string[]>;
} & ThreadActions) {
  const unified = useMemo(() => buildUnifiedItems(file.lines), [file.lines]);
  const [lines, setLines] = useState<string[] | null>(null);
  const [openAbove, setOpenAbove] = useState(NO_HUNKS);
  const [openBelow, setOpenBelow] = useState(false);
  // `target` is "below" of `above<hunkindex>`.
  const [load, setLoad] = useState<{ target: string; failed: boolean } | null>(
    null,
  );
  // Een antwoord dat landt nadat het bestand is weggehaald (andere PR of
  // commit, via de key in DiffView) mag geen state meer zetten.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  const canExpand = headSha !== "" && loadFileLines !== undefined;
  const gaps = useMemo(() => {
    if (!canExpand) return { above: [], below: null };
    const hunks = unified.filter((i) => i.kind === "hunk").length;
    return {
      above: Array.from({ length: hunks }, (_, i) => hiddenAbove(unified, i)),
      below: hiddenBelow(unified, lines?.length ?? UNKNOWN_LENGTH),
    };
  }, [canExpand, unified, lines]);

  const visible = useMemo(
    () =>
      lines === null
        ? unified
        : expandContext(unified, lines, openAbove, openBelow),
    [unified, lines, openAbove, openBelow],
  );
  const marks = useMemo(
    () => marksFor(visible, file.path),
    [visible, file.path],
  );

  async function expand(target: string) {
    const reveal = () => {
      if (target === "below") setOpenBelow(true);
      else setOpenAbove((prev) => new Set(prev).add(Number(target.slice(5))));
    };
    if (lines !== null) {
      reveal();
      return;
    }
    if (loadFileLines === undefined) return;
    setLoad({ target, failed: false });
    try {
      const loaded = await loadFileLines(file.path);
      if (!alive.current) return;
      setLines(loaded);
      reveal();
      setLoad(null);
    } catch {
      if (!alive.current) return;
      setLoad({ target, failed: true });
    }
  }

  function expandFor(target: string, label: string, name: string): Expand {
    return {
      label,
      name,
      status:
        load?.target !== target ? "idle" : load.failed ? "failed" : "loading",
      busy: load !== null && !load.failed,
      onExpand: () => void expand(target),
    };
  }

  const items: readonly (UnifiedItem | SplitItem)[] =
    mode === "unified" ? visible : splitFromUnified(visible);
  let hunkIndex = -1;
  const rows: ViewRow[] = items.map((item) => {
    if (item.kind === "hunk") {
      hunkIndex++;
      const range = openAbove.has(hunkIndex) ? null : gaps.above[hunkIndex];
      return hunkRow(
        item,
        range
          ? expandFor(
              `above${hunkIndex}`,
              `↑ ${plural(size(range))} tonen`,
              `${plural(size(range))} boven dit blok tonen`,
            )
          : null,
      );
    }
    return "left" in item ? splitRow(item, marks) : unifiedRow(item, marks);
  });
  if (gaps.below !== null && !openBelow) {
    const known = lines !== null;
    rows.push(
      footRow(
        expandFor(
          "below",
          known
            ? `↓ ${plural(size(gaps.below))} tonen`
            : "↓ Rest van het bestand tonen",
          known
            ? `${plural(size(gaps.below))} onder dit blok tonen`
            : "Rest van het bestand onder dit blok tonen",
        ),
      ),
    );
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
  headSha,
  loadFileLines,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  headSha?: string;
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
          headSha={headSha}
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
  // Na een geslaagde load verdwijnt dit blok; een late fout mag dan niets zetten.
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    return () => {
      alive.current = false;
    };
  }, []);

  async function load() {
    if (onLoadPerFile === undefined) return;
    setState({ status: "loading" });
    try {
      await onLoadPerFile();
    } catch (error) {
      if (alive.current) {
        setState({ status: "failed", message: (error as Error).message });
      }
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
  subject = "",
  headSha,
  loadFileLines,
  onLoadPerFile,
  ...actions
}: DiffViewProps) {
  if (tooLarge) {
    return <TooLarge key={subject} url={url} onLoadPerFile={onLoadPerFile} />;
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
          key={`${subject}:${file.path}`}
          file={file}
          mode={mode}
          threads={threadsByPath.get(file.path) ?? []}
          headSha={headSha}
          loadFileLines={loadFileLines}
          {...actions}
        />
      ))}
    </div>
  );
}
