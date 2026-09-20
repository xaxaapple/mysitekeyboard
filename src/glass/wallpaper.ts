import { hslToRgb, rgbCss, rgbToHsl, type Rgb } from './color';

export interface WallpaperPalette {
  isDark: boolean;
  /** The active theme's primary colour; every other hue is rotated from it. */
  primary: Rgb;
}

/** Small deterministic PRNG so the wallpaper does not jump when the window resizes. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Paints the page wallpaper that the glass refracts.
 *
 * Liquid glass only looks like glass when there is something to bend, so the
 * wallpaper mixes soft colour fields (for the blur/tint) with crisp shapes,
 * rings and fine lines (for the refraction), in the spirit of the abstract
 * backdrops used by the Liquid DOM showcase. All coordinates are in CSS px;
 * the caller scales the context by the device pixel ratio.
 */
export function drawWallpaper(
  ctx: CanvasRenderingContext2D,
  width: number,
  height: number,
  { isDark, primary }: WallpaperPalette,
): void {
  const base = rgbToHsl(primary);
  // Achromatic themes still get some colour so the glass has something to show.
  const chroma = Math.max(base.s, 0.55);
  const hue = (offset: number) => base.h + offset;
  const color = (offset: number, s: number, l: number, alpha = 1) =>
    rgbCss(hslToRgb(hue(offset), Math.min(1, chroma * s), l), alpha);

  const rand = mulberry32(0x9e3779b1);
  const scale = Math.max(width, height);

  // --- Base ---------------------------------------------------------------
  const sky = ctx.createLinearGradient(0, 0, width, height);
  if (isDark) {
    sky.addColorStop(0, color(-8, 0.55, 0.07));
    sky.addColorStop(0.55, color(40, 0.5, 0.06));
    sky.addColorStop(1, color(110, 0.5, 0.08));
  } else {
    sky.addColorStop(0, color(-6, 0.95, 0.9));
    sky.addColorStop(0.5, color(38, 0.9, 0.93));
    sky.addColorStop(1, color(104, 0.85, 0.9));
  }
  ctx.fillStyle = sky;
  ctx.fillRect(0, 0, width, height);

  // --- Soft colour fields -------------------------------------------------
  const fields: Array<[number, number, number, number, number]> = [
    // x, y, radius (of scale), hue offset, lightness
    [0.08, 0.05, 0.62, 0, isDark ? 0.38 : 0.72],
    [0.95, 0.12, 0.55, 64, isDark ? 0.36 : 0.76],
    [0.55, 0.98, 0.6, -58, isDark ? 0.34 : 0.78],
    [0.02, 0.82, 0.4, 118, isDark ? 0.3 : 0.8],
  ];
  for (const [fx, fy, fr, fh, fl] of fields) {
    const gradient = ctx.createRadialGradient(fx * width, fy * height, 0, fx * width, fy * height, fr * scale);
    gradient.addColorStop(0, color(fh, 1, fl, isDark ? 0.7 : 0.85));
    gradient.addColorStop(1, color(fh, 1, fl, 0));
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, width, height);
  }

  // --- Crisp abstract shapes (these are what the rim refracts) -------------
  ctx.save();
  ctx.globalCompositeOperation = 'source-over';
  const shapeCount = 9;
  for (let i = 0; i < shapeCount; i += 1) {
    const cx = rand() * width;
    const cy = rand() * height;
    const size = (0.1 + rand() * 0.22) * scale;
    const h = (i * 47 + rand() * 30) % 200;
    const gradient = ctx.createLinearGradient(cx - size, cy - size, cx + size, cy + size);
    gradient.addColorStop(0, color(h, 1, isDark ? 0.44 : 0.66, isDark ? 0.36 : 0.5));
    gradient.addColorStop(1, color(h + 50, 1, isDark ? 0.3 : 0.76, isDark ? 0.3 : 0.4));
    ctx.fillStyle = gradient;
    ctx.beginPath();
    const kind = i % 3;
    if (kind === 0) {
      ctx.arc(cx, cy, size * 0.55, 0, Math.PI * 2);
    } else if (kind === 1) {
      const w = size * 1.5;
      const h2 = size * 0.5;
      ctx.roundRect(cx - w / 2, cy - h2 / 2, w, h2, h2 / 2);
    } else {
      const s = size * 0.9;
      ctx.roundRect(cx - s / 2, cy - s / 2, s, s, s * 0.28);
    }
    ctx.fill();
  }

  // Rings with crisp edges.
  ctx.lineWidth = Math.max(3, scale * 0.006);
  for (let i = 0; i < 4; i += 1) {
    const cx = (0.15 + rand() * 0.7) * width;
    const cy = (0.1 + rand() * 0.8) * height;
    const radius = (0.06 + rand() * 0.12) * scale;
    ctx.strokeStyle = color(20 + i * 40, 1, isDark ? 0.6 : 0.55, isDark ? 0.36 : 0.45);
    ctx.beginPath();
    ctx.arc(cx, cy, radius, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();

  // --- Fine lines and a dot lattice --------------------------------------
  ctx.save();
  ctx.strokeStyle = isDark ? 'rgb(255 255 255 / 0.07)' : 'rgb(20 30 60 / 0.07)';
  ctx.lineWidth = 1;
  const step = 72;
  ctx.beginPath();
  for (let x = step / 2; x < width; x += step) {
    ctx.moveTo(x, 0);
    ctx.lineTo(x, height);
  }
  for (let y = step / 2; y < height; y += step) {
    ctx.moveTo(0, y);
    ctx.lineTo(width, y);
  }
  ctx.stroke();

  ctx.fillStyle = isDark ? 'rgb(255 255 255 / 0.22)' : 'rgb(20 30 60 / 0.2)';
  for (let y = step / 2; y < height; y += step) {
    for (let x = step / 2; x < width; x += step) {
      ctx.beginPath();
      ctx.arc(x, y, 1.8, 0, Math.PI * 2);
      ctx.fill();
    }
  }
  ctx.restore();
}
