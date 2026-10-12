import { openUrl } from "@tauri-apps/plugin-opener";
import { Fragment, type ReactNode, useState } from "react";
import type { ReviewThread } from "../../lib/github/prDetail";
import { ThreadItem } from "./CommentsView";
import { buildUnifiedItems, isGeneratedPath, placeThreads } from "./diffModel";
import { type DiffFile, parseDiff } from "./diffParse";
import { buildSplitItems } from "./diffSplit";
import "./inspector.css";

type ThreadHandlers = {
  onReply: (threadId: string, body: string) => Promise<void>;
  onSetResolved: (threadId: string, resolved: boolean) => Promise<void>;
};

interface DiffViewProps extends ThreadHandlers {
  diff: string;
  tooLarge: boolean;
  url: string;
  mode: "unified" | "split";
  threads: ReviewThread[];
}

export function countChanges(lines: readonly { kind: string }[]): {
  add: number;
  del: number;
} {
  let add = 0;
  let del = 0;
  for (const line of lines) {
    if (line.kind === "add") add++;
    else if (line.kind === "del") del++;
  }
  return { add, del };
}

/** Tekst na de tweede @@ van een hunk-kop; "" als er geen functiecontext is. */
function splitHunkContext(text: string): string {
  const match = text.match(/^@@[^@]*@@(.*)$/);
  return (match?.[1] ?? "").trim();
}

function ThreadBlock({
  threads,
  onReply,
  onSetResolved,
  showLocation = false,
}: { threads: ReviewThread[]; showLocation?: boolean } & ThreadHandlers) {
  return (
    <div className="inspector-diff-threads">
      {threads.map((thread) => (
        <ThreadItem
          key={thread.id || `${thread.path}-${thread.line}`}
          thread={thread}
          showLocation={showLocation}
          onReply={onReply}
          onSetResolved={onSetResolved}
        />
      ))}
    </div>
  );
}

function OutdatedBlock({
  threads,
  onReply,
  onSetResolved,
}: { threads: ReviewThread[] } & ThreadHandlers) {
  const [shown, setShown] = useState(false);
  return (
    <div className="inspector-diff-outdated">
      <div className="inspector-diff-outdated-head">
        <span>
          {threads.length === 1
            ? "1 thread bij code die niet meer in deze diff staat"
            : `${threads.length} threads bij code die niet meer in deze diff staat`}
        </span>
        <button
          type="button"
          className="inspector-thread-action"
          aria-expanded={shown}
          onClick={() => setShown(!shown)}
        >
          {shown ? "Verbergen" : "Tonen"}
        </button>
      </div>
      {shown && (
        <ThreadBlock
          threads={threads}
          showLocation
          onReply={onReply}
          onSetResolved={onSetResolved}
        />
      )}
    </div>
  );
}

function FileDiff({
  file,
  mode,
  threads,
  onReply,
  onSetResolved,
}: {
  file: DiffFile;
  mode: "unified" | "split";
  threads: ReviewThread[];
} & ThreadHandlers) {
  const generated = isGeneratedPath(file.path);
  const [open, setOpen] = useState(!generated);
  const { add, del } = countChanges(file.lines);
  const slash = file.path.lastIndexOf("/");
  const dir = slash === -1 ? "" : file.path.slice(0, slash + 1);
  const name = file.path.slice(slash + 1);

  let rows: ReactNode[] = [];
  let outdated: ReviewThread[] = [];
  if (open) {
    const fileThreads = threads.filter((t) => t.path === file.path);
    const threadsAfter = (
      index: number,
      placed: Map<number, ReviewThread[]>,
    ) => {
      const here = placed.get(index);
      return here ? (
        <div className="inspector-diff-thread-row">
          <ThreadBlock
            threads={here}
            onReply={onReply}
            onSetResolved={onSetResolved}
          />
        </div>
      ) : null;
    };

    if (mode === "unified") {
      const items = buildUnifiedItems(file.lines);
      const placed = placeThreads(
        items.map((i) =>
          i.kind === "row"
            ? { oldNo: i.oldNo, newNo: i.newNo }
            : { oldNo: null, newNo: null },
        ),
        fileThreads,
      );
      outdated = placed.outdated;
      rows = items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: regelvolgorde is de identiteit, geen stabielere key beschikbaar
        <Fragment key={i}>
          {item.kind === "hunk" ? (
            <div className="inspector-diff-line-hunk">
              {item.context !== ""
                ? item.context
                : `@@ -${item.oldStart} +${item.newStart} @@`}
            </div>
          ) : (
            <div className="inspector-diff-row">
              <span className="inspector-diff-lineno">{item.oldNo ?? ""}</span>
              <span className="inspector-diff-lineno">{item.newNo ?? ""}</span>
              <span
                className={`inspector-diff-cell inspector-diff-cell-${item.type}`}
              >
                {item.text}
              </span>
            </div>
          )}
          {threadsAfter(i, placed.atRow)}
        </Fragment>
      ));
    } else {
      const items = buildSplitItems(file.lines);
      const placed = placeThreads(
        items.map((i) =>
          i.kind === "row"
            ? { oldNo: i.left.lineNo, newNo: i.right.lineNo }
            : { oldNo: null, newNo: null },
        ),
        fileThreads,
      );
      outdated = placed.outdated;
      rows = items.map((item, i) => (
        // biome-ignore lint/suspicious/noArrayIndexKey: regelvolgorde is de identiteit, geen stabielere key beschikbaar
        <Fragment key={i}>
          {item.kind === "hunk" ? (
            <div className="inspector-diff-line-hunk">
              {splitHunkContext(item.text) || item.text}
            </div>
          ) : (
            <div className="inspector-diff-row">
              <span className="inspector-diff-lineno">
                {item.left.lineNo ?? ""}
              </span>
              <span
                className={`inspector-diff-cell inspector-diff-cell-${item.left.kind}`}
              >
                {item.left.text}
              </span>
              <span className="inspector-diff-lineno">
                {item.right.lineNo ?? ""}
              </span>
              <span
                className={`inspector-diff-cell inspector-diff-cell-${item.right.kind}`}
              >
                {item.right.text}
              </span>
            </div>
          )}
          {threadsAfter(i, placed.atRow)}
        </Fragment>
      ));
    }
  }

  return (
    <section className="inspector-diff-file">
      <button
        type="button"
        className="inspector-diff-file-head"
        aria-expanded={open}
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
        <span className="inspector-diff-file-count">
          <span className="inspector-diff-add">+{add}</span>{" "}
          <span className="inspector-diff-del">−{del}</span>
        </span>
      </button>
      {open && (
        <>
          <div className="inspector-diff-lines">
            <div className={`inspector-diff-grid inspector-diff-grid-${mode}`}>
              {rows}
            </div>
          </div>
          {outdated.length > 0 && (
            <OutdatedBlock
              threads={outdated}
              onReply={onReply}
              onSetResolved={onSetResolved}
            />
          )}
        </>
      )}
    </section>
  );
}

export function DiffView({
  diff,
  tooLarge,
  url,
  mode,
  threads,
  onReply,
  onSetResolved,
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

  const files = parseDiff(diff);

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
          threads={threads}
          onReply={onReply}
          onSetResolved={onSetResolved}
        />
      ))}
    </div>
  );
}
