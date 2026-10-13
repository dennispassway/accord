import { openUrl } from "@tauri-apps/plugin-opener";
import {
  Fragment,
  type ReactNode,
  useId,
  useMemo,
  useRef,
  useState,
} from "react";
import type { DiffSide, ReviewThread } from "../../lib/github/prDetail";
import type { DraftThread } from "../../lib/github/review";
import { errorMessage } from "../update/updateState";
import { type ThreadActions, ThreadList } from "./CommentsView";
import type { DiffViewMode } from "./cockpitPrefs";
import {
  buildUnifiedItems,
  contiguousRuns,
  countChanges,
  diffRowKeys,
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
import {
  type DraftActions,
  DraftComposer,
  DraftItem,
  SIDE_LABEL,
} from "./DraftComposer";
import type { ReviewDraft } from "./reviewDrafts";
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
  /** Afwezig = geen opmerkingen op regels (geen + in de goot). */
  review?: DraftActions;
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

/** De + in de goot: alleen op rijen die in de hunks staan (`keys`), want
 * GitHub weigert regelopmerkingen op uitgeklapte context. */
interface Gutter {
  onAdd: (line: number, side: DiffSide) => void;
  keys: ReadonlySet<string>;
  fileName: string;
}

// De knoppen staan bewust in de tabvolgorde (toetsenbordgebruikers moeten
// kunnen reageren), en zijn bij focus zichtbaar (zie inspector.css).
function AddCommentButton({
  line,
  side,
  markKey,
  gutter,
}: {
  line: number | null;
  side: DiffSide;
  markKey: string | null;
  gutter: Gutter | undefined;
}) {
  if (
    gutter === undefined ||
    line === null ||
    markKey === null ||
    !gutter.keys.has(markKey)
  ) {
    return null;
  }
  return (
    <button
      type="button"
      className="inspector-diff-add-comment"
      aria-label={`Opmerking op ${gutter.fileName} regel ${line} (${SIDE_LABEL[side]})`}
      data-side={side}
      onClick={() => gutter.onAdd(line, side)}
    >
      +
    </button>
  );
}

function unifiedRow(
  item: UnifiedRow,
  marks: Marks,
  gutter: Gutter | undefined,
): ViewRow {
  const markKey = lineKey(item.type, item.oldNo, item.newNo);
  return {
    key: `${item.oldNo ?? ""}-${item.newNo ?? ""}`,
    numbers: { oldNo: item.oldNo, newNo: item.newNo },
    node: (
      <div className="inspector-diff-row">
        <span className="inspector-diff-lineno">
          {item.oldNo ?? ""}
          {item.type === "del" && (
            <AddCommentButton
              line={item.oldNo}
              side="LEFT"
              markKey={markKey}
              gutter={gutter}
            />
          )}
        </span>
        <span className="inspector-diff-lineno">
          {item.newNo ?? ""}
          <AddCommentButton
            line={item.newNo}
            side="RIGHT"
            markKey={markKey}
            gutter={gutter}
          />
        </span>
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

function splitRow(
  { left, right }: SplitRow,
  marks: Marks,
  gutter: Gutter | undefined,
): ViewRow {
  const leftKey = splitMarkKey(left, right.lineNo);
  const rightKey = splitMarkKey(right, right.lineNo);
  return {
    key: `${left.lineNo ?? ""}-${right.lineNo ?? ""}`,
    numbers: { oldNo: left.lineNo, newNo: right.lineNo },
    node: (
      <div className="inspector-diff-row">
        <span className="inspector-diff-lineno">
          {left.lineNo ?? ""}
          <AddCommentButton
            line={left.lineNo}
            side="LEFT"
            markKey={leftKey}
            gutter={gutter}
          />
        </span>
        <Cell
          kind={left.kind}
          text={left.text}
          markKey={leftKey}
          marks={marks}
        />
        <span className="inspector-diff-lineno">
          {right.lineNo ?? ""}
          <AddCommentButton
            line={right.lineNo}
            side="RIGHT"
            markKey={rightKey}
            gutter={gutter}
          />
        </span>
        <Cell
          kind={right.kind}
          text={right.text}
          markKey={rightKey}
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
  review,
  fileDrafts,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  id: string;
  loadFileLines?: (path: string) => Promise<string[]>;
  review?: DraftActions;
  fileDrafts: readonly ReviewDraft[];
} & ThreadActions) {
  const unified = useMemo(() => buildUnifiedItems(file.lines), [file.lines]);
  const [lines, setLines] = useState<string[] | null>(null);
  const [expansion, setExpansion] = useState(NO_EXPANSION);
  const [load, setLoad] = useState<LoadState | null>(null);
  // Open opstelvelden per (regel, kant), niet per rij: de rij-key verschilt
  // tussen unified en split, dus een veld dat aan een rij hing ging bij een
  // weergavewissel verloren. Meerdere tegelijk, zodat een klik op een tweede +
  // het eerste veld niet weggooit. De tekst staat in een ref-map, ook zonder
  // render per toets, en overleeft zo de remount van het veld.
  const [composing, setComposing] = useState<
    { line: number; diffSide: DiffSide }[]
  >([]);
  const composeText = useRef(new Map<string, string>());
  // Verzendstatus per (kant, regel) in state hier, niet in het veld: het veld
  // kan tijdens het versturen remounten of weggaan.
  const [sendState, setSendState] = useState<
    Record<string, { busy: boolean; error: string | null }>
  >({});

  function openComposer(line: number, diffSide: DiffSide) {
    setComposing((prev) =>
      prev.some((c) => c.line === line && c.diffSide === diffSide)
        ? prev
        : [...prev, { line, diffSide }],
    );
  }

  function closeComposer(line: number, diffSide: DiffSide) {
    composeText.current.delete(`${diffSide}${line}`);
    setSendState((prev) => {
      const next = { ...prev };
      delete next[`${diffSide}${line}`];
      return next;
    });
    setComposing((prev) =>
      prev.filter((c) => !(c.line === line && c.diffSide === diffSide)),
    );
  }

  /** Los versturen: de uitkomst landt op deze state, ook als het veld intussen
   * is geremount of weg is. Bij succes sluit het veld altijd (en wist de
   * bewaarde tekst); bij een fout blijft het open met de melding. */
  async function sendLoose(thread: DraftThread) {
    const textKey = `${thread.side}${thread.line}`;
    setSendState((prev) => ({
      ...prev,
      [textKey]: { busy: true, error: null },
    }));
    try {
      await review?.onSendLoose(thread);
    } catch (failure) {
      setSendState((prev) => ({
        ...prev,
        [textKey]: { busy: false, error: errorMessage(failure) },
      }));
      return;
    }
    closeComposer(thread.line, thread.side);
  }

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
  const gutter: Gutter | undefined = review && {
    onAdd: openComposer,
    keys: diffRowKeys(unified),
    fileName: file.path.slice(file.path.lastIndexOf("/") + 1),
  };
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
    return "left" in item
      ? splitRow(item, marks, gutter)
      : unifiedRow(item, marks, gutter);
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

  const rowNumbers = rows.map((row) => row.numbers);
  const placed = placeThreads(rowNumbers, threads);
  const placedDrafts = placeThreads(
    rowNumbers,
    fileDrafts.map((draft) => ({
      draft,
      line: draft.line,
      diffSide: draft.side,
    })),
  );
  const placedComposers = placeThreads(rowNumbers, composing);
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
              const hereDrafts = placedDrafts.atRow.get(index);
              const hereComposers = placedComposers.atRow.get(index);
              return (
                <Fragment key={row.key}>
                  {row.node}
                  {(here || hereDrafts || hereComposers) && (
                    <div className="inspector-diff-thread-row">
                      {here && (
                        <ThreadList
                          threads={here}
                          showLocation={false}
                          showSide={mode === "split"}
                          {...actions}
                        />
                      )}
                      {review &&
                        hereDrafts?.map(({ draft }) => (
                          <DraftItem
                            key={draft.id}
                            draft={draft}
                            showSide={mode === "split"}
                            onEdit={review.onEdit}
                            onRemove={review.onRemove}
                          />
                        ))}
                      {review &&
                        hereComposers?.map(({ line, diffSide }) => {
                          const at = { path: file.path, line, side: diffSide };
                          const textKey = `${diffSide}${line}`;
                          return (
                            <DraftComposer
                              key={textKey}
                              line={line}
                              side={diffSide}
                              showSide={mode === "split"}
                              fileName={gutter?.fileName ?? file.path}
                              busy={sendState[textKey]?.busy ?? false}
                              error={sendState[textKey]?.error ?? null}
                              initialText={
                                composeText.current.get(textKey) ?? ""
                              }
                              onTextChange={(text) =>
                                composeText.current.set(textKey, text)
                              }
                              onAdd={(body) => review.onAdd({ ...at, body })}
                              onSendLoose={(body) =>
                                void sendLoose({ ...at, body })
                              }
                              onClose={() => closeComposer(line, diffSide)}
                            />
                          );
                        })}
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
  review,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  loadFileLines?: (path: string) => Promise<string[]>;
  review?: DraftActions;
} & ThreadActions) {
  const generated = isGeneratedPath(file.path);
  const unresolved = threads.filter((t) => !t.isResolved).length;
  // Een gegenereerd bestand met een open thread mag niet verborgen blijven.
  const [open, setOpen] = useState(!generated || unresolved > 0);
  const bodyId = useId();
  const { add, del } = countChanges(file.lines);
  const fileDrafts = (review?.drafts ?? []).filter((d) => d.path === file.path);
  const draftCount = fileDrafts.length;
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
        {draftCount > 0 && (
          <span className="inspector-diff-file-drafts">
            {draftCount} in review
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
          review={review}
          fileDrafts={fileDrafts}
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
  review,
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
          review={review}
          {...actions}
        />
      ))}
    </div>
  );
}
