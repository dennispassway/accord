import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, type ReactNode, useId, useState } from "react";
import type { ReviewThread } from "../../lib/github/prDetail";
import { type ThreadActions, ThreadList } from "./CommentsView";
import type { DiffViewMode } from "./cockpitPrefs";
import {
  buildUnifiedItems,
  countChanges,
  fileStatus,
  isGeneratedPath,
  type LineNumbers,
  placeThreads,
  type UnifiedHunk,
  type UnifiedRow,
} from "./diffModel";
import type { DiffFile, DiffLine } from "./diffParse";
import { buildSplitItems, type SplitRow } from "./diffSplit";
import "./inspector.css";

interface DiffViewProps extends ThreadActions {
  files: DiffFile[];
  tooLarge: boolean;
  url: string;
  mode: DiffViewMode;
  threadsByPath: ReadonlyMap<string, ReviewThread[]>;
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

function hunkRow(item: UnifiedHunk): ViewRow {
  return {
    key: `h${item.oldStart}-${item.newStart}`,
    numbers: NO_NUMBERS,
    node: (
      <div className="inspector-diff-line-hunk">
        {item.context !== ""
          ? item.context
          : `@@ -${item.oldStart} +${item.newStart} @@`}
      </div>
    ),
  };
}

function unifiedRow(item: UnifiedRow): ViewRow {
  return {
    key: `${item.oldNo ?? ""}-${item.newNo ?? ""}`,
    numbers: { oldNo: item.oldNo, newNo: item.newNo },
    node: (
      <div className="inspector-diff-row">
        <span className="inspector-diff-lineno">{item.oldNo ?? ""}</span>
        <span className="inspector-diff-lineno">{item.newNo ?? ""}</span>
        <span
          className={`inspector-diff-cell inspector-diff-cell-${item.type}`}
        >
          {item.text}
        </span>
      </div>
    ),
  };
}

function splitRow({ left, right }: SplitRow): ViewRow {
  return {
    key: `${left.lineNo ?? ""}-${right.lineNo ?? ""}`,
    numbers: { oldNo: left.lineNo, newNo: right.lineNo },
    node: (
      <div className="inspector-diff-row">
        <span className="inspector-diff-lineno">{left.lineNo ?? ""}</span>
        <span
          className={`inspector-diff-cell inspector-diff-cell-${left.kind}`}
        >
          {left.text}
        </span>
        <span className="inspector-diff-lineno">{right.lineNo ?? ""}</span>
        <span
          className={`inspector-diff-cell inspector-diff-cell-${right.kind}`}
        >
          {right.text}
        </span>
      </div>
    ),
  };
}

function viewRows(lines: readonly DiffLine[], mode: DiffViewMode): ViewRow[] {
  return mode === "unified"
    ? buildUnifiedItems(lines).map((item) =>
        item.kind === "hunk" ? hunkRow(item) : unifiedRow(item),
      )
    : buildSplitItems(lines).map((item) =>
        item.kind === "hunk" ? hunkRow(item) : splitRow(item),
      );
}

function FileBody({
  file,
  mode,
  threads,
  id,
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
  id: string;
} & ThreadActions) {
  const rows = viewRows(file.lines, mode);
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
  ...actions
}: {
  file: DiffFile;
  mode: DiffViewMode;
  threads: ReviewThread[];
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
          {...actions}
        />
      )}
    </section>
  );
}

export function DiffView({
  files,
  tooLarge,
  url,
  mode,
  threadsByPath,
  ...actions
}: DiffViewProps) {
  if (tooLarge) {
    return (
      <div className="inspector-empty">
        <p>Deze diff is te groot voor GitHub's API.</p>
        <button
          type="button"
          className="inspector-github-button"
          onClick={() => void openUrl(url)}
        >
          Open op GitHub
        </button>
      </div>
    );
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
          {...actions}
        />
      ))}
    </div>
  );
}
