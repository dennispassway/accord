import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { MOCK_PRS } from "../../lib/mock/fixtures";
import { AgentActionButton } from "./AgentActionButton";

const base = MOCK_PRS.find((pr) => pr.agentReviewRounds === 2);

function render(rounds: number, mode: "commentsOnly" | "withFixes") {
  if (base == null) throw new Error("fixture met twee rondes ontbreekt");
  return renderToStaticMarkup(
    <AgentActionButton
      pr={{ ...base, agentReviewRounds: rounds }}
      label={(agent) => `Review met ${agent}`}
      preferred="claude"
      mode={mode}
      disabledReason={() => null}
      modelLine={() => "model"}
      isReview
      onStartRun={() => {}}
    />,
  );
}

describe("AgentActionButton review-ronde", () => {
  it("toont geen ronde-label zonder eerdere review", () => {
    expect(render(0, "withFixes")).not.toContain("ronde");
  });

  it("toont ronde 2 en de gewone naam na één review", () => {
    const html = render(1, "withFixes");
    expect(html).toContain("ronde 2");
    expect(html).toContain("Review met claude");
  });

  it("noemt de withFixes-knop vanaf ronde 3 advies", () => {
    const html = render(2, "withFixes");
    expect(html).toContain("ronde 3");
    expect(html).toContain("Advies van Claude");
  });

  it("laat commentsOnly op ronde 3 gewoon een review heten", () => {
    const html = render(2, "commentsOnly");
    expect(html).toContain("ronde 3");
    expect(html).toContain("Review met claude");
  });
});
