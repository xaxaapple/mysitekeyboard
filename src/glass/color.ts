export type Rgb = { r: number; g: number; b: number };

let scratch: CanvasRenderingContext2D | null = null;

/**
 * Resolves any CSS colour string (hex, hsl, oklch, color-mix, ...) to sRGB by
 * letting the browser paint one pixel. Returns `fallback` if it cannot be parsed.
 */
export function parseCssColor(value: string, fallback: Rgb): Rgb {
  const text = value.trim();
  if (!text) return fallback;

  if (!scratch) {
    const canvas = document.createElement('canvas');
    canvas.width = 1;
    canvas.height = 1;
    scratch = canvas.getContext('2d', { willReadFrequently: true });
  }
  if (!scratch) return fallback;

  // fillStyle silently ignores invalid values, so probe with two sentinels.
  scratch.clearRect(0, 0, 1, 1);
  scratch.fillStyle = '#000';
  scratch.fillStyle = text;
  const first = scratch.fillStyle;
  scratch.fillStyle = '#fff';
  scratch.fillStyle = text;
  if (first !== scratch.fillStyle) return fallback;

  scratch.fillRect(0, 0, 1, 1);
  const [r, g, b] = scratch.getImageData(0, 0, 1, 1).data;
  return { r: r / 255, g: g / 255, b: b / 255 };
}

export function rgbToHsl({ r, g, b }: Rgb): { h: number; s: number; l: number } {
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  if (d === 0) return { h: 0, s: 0, l };

  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  let h: number;
  if (max === r) h = (g - b) / d + (g < b ? 6 : 0);
  else if (max === g) h = (b - r) / d + 2;
  else h = (r - g) / d + 4;
  return { h: h * 60, s, l };
}

export function hslToRgb(h: number, s: number, l: number): Rgb {
  const hue = ((h % 360) + 360) % 360;
  const k = (n: number) => (n + hue / 30) % 12;
  const a = s * Math.min(l, 1 - l);
  const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbCss({ r, g, b }: Rgb, alpha = 1): string {
  return `rgb(${Math.round(r * 255)} ${Math.round(g * 255)} ${Math.round(b * 255)} / ${alpha})`;
}
