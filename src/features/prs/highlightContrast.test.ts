import { describe, expect, it } from "vitest";
import appCss from "../../App.css?raw";
import highlightCss from "./highlight.css?raw";

type Rgb = [number, number, number];

/** Een add/del-rij krijgt ~10% van --ok/--err over de code-achtergrond. */
const ROW_TINT = 0.1;

/** De echte rijtinten in inspector.css en het gewijzigde woord erbovenop. */
const ADD_ROW_TINT = 0.14;
const DEL_ROW_TINT = 0.12;
const WORD_TINT = 0.3;

function hexToRgb(hex: string): Rgb {
  const parse = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return [parse(1), parse(3), parse(5)];
}

function luminance([r, g, b]: Rgb): number {
  const ch = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix(fg: Rgb, alpha: number, bg: Rgb): Rgb {
  return [0, 1, 2].map(
    (i) => (fg[i] as number) * alpha + (bg[i] as number) * (1 - alpha),
  ) as Rgb;
}

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
      ["add-rij", mix(hexToken(appCss, theme, "ok"), ROW_TINT, base)],
      ["del-rij", mix(hexToken(appCss, theme, "err"), ROW_TINT, base)],
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
