/** Kleurrekenwerk voor de contrasttests (themeContrast, highlightContrast). */
export type Rgb = [number, number, number];

export function hexToRgb(hex: string): Rgb {
  const parse = (i: number) => Number.parseInt(hex.slice(i, i + 2), 16);
  return [parse(1), parse(3), parse(5)];
}

function luminance([r, g, b]: Rgb): number {
  const channel = (v: number) => {
    const c = v / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b);
}

export function contrast(a: Rgb, b: Rgb): number {
  const la = luminance(a);
  const lb = luminance(b);
  return (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
}

/** `fg` met dekking `ratio` over `bg`. */
export function mix([fr, fg, fb]: Rgb, ratio: number, [br, bg, bb]: Rgb): Rgb {
  const blend = (f: number, b: number) => f * ratio + b * (1 - ratio);
  return [blend(fr, br), blend(fg, bg), blend(fb, bb)];
}
