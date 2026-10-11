import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { Avatar, avatarUrl } from "./Avatar";

describe("avatarUrl", () => {
  it("vraagt de avatar op dubbele grootte op bij de login", () => {
    expect(avatarUrl("octo-cat", 18)).toBe(
      "https://avatars.githubusercontent.com/octo-cat?s=36",
    );
  });

  it("codeert een bot-login zodat de haken het pad niet breken", () => {
    expect(avatarUrl("renovate[bot]", 18)).toBe(
      "https://avatars.githubusercontent.com/renovate%5Bbot%5D?s=36",
    );
  });
});

describe("Avatar", () => {
  it("zet de foto over de initiaal voor een mens", () => {
    const html = renderToStaticMarkup(
      <Avatar author={{ kind: "human", login: "octo-cat" }} size={18} />,
    );
    expect(html).toContain(">O<img");
    expect(html).toContain(
      'src="https://avatars.githubusercontent.com/octo-cat?s=36"',
    );
  });

  it("toont voor een agent het icoon en geen foto", () => {
    const html = renderToStaticMarkup(
      <Avatar
        author={{ kind: "agent", agent: "claude", login: "claude[bot]" }}
        size={18}
      />,
    );
    expect(html).not.toContain("<img");
  });
});
