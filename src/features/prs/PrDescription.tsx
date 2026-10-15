import { useState } from "react";
import { CommentBody } from "./commentMarkdown";
import "./inspector.css";

interface PrDescriptionProps {
  body: string;
  /** Weglaten als de diff te groot is: het aantal is dan niet bekend. */
  fileCount?: number;
  add: number;
  del: number;
}

/** Zonder meting: een beschrijving van deze lengte of met zoveel regels is
 * hoger dan het ingeklapte vlak van ~5 regels. */
const LONG_BODY_CHARS = 280;
const LONG_BODY_LINES = 5;

export function PrDescription({
  body,
  fileCount,
  add,
  del,
}: PrDescriptionProps) {
  const [expanded, setExpanded] = useState(false);
  const empty = body.trim() === "";
  const long =
    body.length > LONG_BODY_CHARS || body.split("\n").length > LONG_BODY_LINES;

  return (
    <section className="inspector-description">
      <div className="inspector-description-meta">
        {fileCount !== undefined &&
          `${fileCount} ${fileCount === 1 ? "bestand" : "bestanden"}`}
        <span className="inspector-diff-add">+{add}</span>
        <span className="inspector-diff-del">−{del}</span>
      </div>
      {empty ? (
        <p className="inspector-description-empty">Geen beschrijving.</p>
      ) : (
        <>
          <div
            className={
              long && !expanded
                ? "inspector-comment-text inspector-description-body collapsed"
                : "inspector-comment-text inspector-description-body"
            }
          >
            <CommentBody>{body}</CommentBody>
          </div>
          {long && (
            <button
              type="button"
              className="inspector-description-toggle"
              aria-expanded={expanded}
              onClick={() => setExpanded(!expanded)}
            >
              {expanded ? "Inklappen" : "Hele beschrijving tonen"}
            </button>
          )}
        </>
      )}
    </section>
  );
}
