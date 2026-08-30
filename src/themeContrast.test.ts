import { describe, expect, it } from "vitest";
import appCss from "./App.css?raw";

/** De statuskleuren staan als tekst op hun eigen tint (sectiekop-icoon en
 * -count, statuspill, statuschip: `color-mix(currentColor 11%, transparent)`).
 * Die tint over de lijstachtergrond is de echte achtergrond, niet wit. */
const TINT = 0.11;
/** --list (rgba(255, 255, 255, 0.88)) over de body-achtergrond #f0f0f3. */
const LIST_BG: Rgb = [253, 253, 254];

type Rgb = [number, number, number];

function hexToRgb(hex: string): Rgb {
  const parse = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return [parse(1), parse(3), parse(5)];
}

function relativeLuminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

function contrast(a: Rgb, b: Rgb): number {
  const la = relativeLuminance(a);
  const lb = relativeLuminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

function mix([fr, fg, fb]: Rgb, ratio: number, [br, bg, bb]: Rgb): Rgb {
  const blend = (f: number, b: number) => f * ratio + b * (1 - ratio);
  return [blend(fr, br), blend(fg, bg), blend(fb, bb)];
}

function lightToken(name: string): Rgb {
  const block = appCss.slice(appCss.indexOf('[data-theme="light"]'));
  const hex = block.match(new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6});`))?.[1];
  if (hex == null) throw new Error(`token --${name} niet gevonden`);
  return hexToRgb(hex);
}

describe("lichte statuskleuren", () => {
  for (const name of ["ok", "err", "warn", "accent", "agent"]) {
    it(`--${name} haalt 4,5:1 als tekst op de lijstachtergrond`, () => {
      expect(contrast(lightToken(name), LIST_BG)).toBeGreaterThanOrEqual(4.5);
    });

    it(`--${name} haalt 4,5:1 als tekst op zijn eigen tint`, () => {
      const color = lightToken(name);
      expect(contrast(color, mix(color, TINT, LIST_BG))).toBeGreaterThanOrEqual(
        4.5,
      );
    });
  }
});
