import { describe, expect, it } from "vitest";
import appCss from "../../App.css?raw";
import { contrast, hexToRgb, mix, type Rgb } from "../../contrastHelpers";
import highlightCss from "./highlight.css?raw";
import inspectorCss from "./inspector.css?raw";

/** Het tintpercentage van `selector` uit inspector.css, als fractie. */
function tint(selector: string, token: "ok" | "err"): number {
  const escaped = selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const percent = inspectorCss.match(
    new RegExp(
      `${escaped}\\s*\\{[^}]*?color-mix\\(in oklab, var\\(--${token}\\) (\\d+)%`,
    ),
  )?.[1];
  if (percent === undefined) throw new Error(`tint van ${selector} ontbreekt`);
  return Number(percent) / 100;
}

/** De echte rijtinten en het gewijzigde woord erbovenop. */
const ADD_ROW_TINT = tint(".inspector-diff-cell-add", "ok");
const DEL_ROW_TINT = tint(".inspector-diff-cell-del", "err");
const WORD_TINT = tint(".inspector-diff-cell-add .inspector-diff-word", "ok");

function block(css: string, theme: "dark" | "light"): string {
  const start = css.indexOf(`[data-theme="${theme}"]`);
  if (start < 0) throw new Error(`blok ${theme} niet gevonden`);
  return css.slice(start, css.indexOf("}", start));
}

function hexToken(css: string, theme: "dark" | "light", name: string): Rgb {
  const hex = block(css, theme).match(
    new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`),
  )?.[1];
  if (hex == null) throw new Error(`token --${name} (${theme}) niet gevonden`);
  return hexToRgb(hex);
}

function rgbaToken(
  theme: "dark" | "light",
  name: string,
): { rgb: Rgb; a: number } {
  const m = block(appCss, theme).match(
    new RegExp(
      `--${name}:\\s*rgba\\((\\d+),\\s*(\\d+),\\s*(\\d+),\\s*([\\d.]+)\\)`,
    ),
  );
  if (m == null) throw new Error(`token --${name} (${theme}) niet gevonden`);
  return { rgb: [Number(m[1]), Number(m[2]), Number(m[3])], a: Number(m[4]) };
}

/** --code over --menu over --bg: de ondergrond van de diff-tekst. */
function codeBg(theme: "dark" | "light"): Rgb {
  const menu = rgbaToken(theme, "menu");
  const menuOnBg = mix(menu.rgb, menu.a, hexToken(appCss, theme, "bg"));
  const code = rgbaToken(theme, "code");
  return mix(code.rgb, code.a, menuOnBg);
}

function syntaxTokens(): string[] {
  const names = [...highlightCss.matchAll(/--(hl-[a-z]+):\s*#/g)].map(
    (m) => m[1] as string,
  );
  if (names.length === 0) throw new Error("geen --hl-* tokens gevonden");
  return [...new Set(names)];
}

for (const theme of ["dark", "light"] as const) {
  describe(`syntaxkleuren (${theme})`, () => {
    const base = codeBg(theme);
    const backgrounds: [string, Rgb][] = [
      ["code", base],
      ["add-rij", mix(hexToken(appCss, theme, "ok"), ADD_ROW_TINT, base)],
      ["del-rij", mix(hexToken(appCss, theme, "err"), DEL_ROW_TINT, base)],
    ];
    for (const name of syntaxTokens()) {
      for (const [label, bg] of backgrounds) {
        it(`--${name} haalt 4,5:1 op ${label}`, () => {
          expect(
            contrast(hexToken(highlightCss, theme, name), bg),
          ).toBeGreaterThanOrEqual(4.5);
        });
      }
    }
  });

  // Een gewijzigd woord valt buiten de syntaxkleuren: die halen 4,5:1 niet op
  // de sterkere tint. De tekst erin neemt --text-1.
  describe(`gewijzigd woord (${theme})`, () => {
    const base = codeBg(theme);
    for (const [label, token, rowTint] of [
      ["add", "ok", ADD_ROW_TINT],
      ["del", "err", DEL_ROW_TINT],
    ] as const) {
      it(`--text-1 haalt 4,5:1 op het ${label}-woord`, () => {
        const color = hexToken(appCss, theme, token);
        const bg = mix(color, WORD_TINT, mix(color, rowTint, base));
        expect(
          contrast(hexToken(appCss, theme, "text-1"), bg),
        ).toBeGreaterThanOrEqual(4.5);
      });
    }
  });
}
