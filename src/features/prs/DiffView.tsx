import { openUrl } from "@tauri-apps/plugin-opener";
import { parseDiff } from "./diffParse";
import { buildSplitItems } from "./diffSplit";
import "./inspector.css";

interface DiffViewProps {
  diff: string;
  tooLarge: boolean;
  url: string;
}

function countChanges(lines: { kind: string }[]): { add: number; del: number } {
  let add = 0;
  let del = 0;
  for (const line of lines) {
    if (line.kind === "add") add++;
    else if (line.kind === "del") del++;
  }
  return { add, del };
}

export function DiffView({ diff, tooLarge, url }: DiffViewProps) {
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
      {files.map((file) => {
        const { add, del } = countChanges(file.lines);
        const items = buildSplitItems(file.lines);
        return (
          <details key={file.path} open className="inspector-diff-file">
            <summary className="inspector-diff-file-summary">
              <span className="inspector-diff-file-path">{file.path}</span>
              <span className="inspector-diff-file-count">
                <span className="inspector-diff-add">+{add}</span>{" "}
                <span className="inspector-diff-del">-{del}</span>
              </span>
            </summary>
            <div className="inspector-diff-lines">
              <div className="inspector-diff-grid">
                {items.map((item, i) => {
                  if (item.kind === "hunk") {
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: regelvolgorde is de identiteit, geen stabielere key beschikbaar
                      <div key={i} className="inspector-diff-line-hunk">
                        {item.text}
                      </div>
                    );
                  }
                  if (item.kind === "meta") {
                    return (
                      // biome-ignore lint/suspicious/noArrayIndexKey: regelvolgorde is de identiteit, geen stabielere key beschikbaar
                      <div key={i} className="inspector-diff-line-meta">
                        {item.text}
                      </div>
                    );
                  }
                  return (
                    // biome-ignore lint/suspicious/noArrayIndexKey: regelvolgorde is de identiteit, geen stabielere key beschikbaar
                    <div key={i} className="inspector-diff-row">
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
                  );
                })}
              </div>
            </div>
          </details>
        );
      })}
    </div>
  );
}
