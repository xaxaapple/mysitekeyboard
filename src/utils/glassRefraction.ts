/**
 * Edge refraction for the Liquid Glass design.
 *
 * Real "liquid glass" bends the backdrop along its bezel. In the browser we can
 * approximate that with an SVG displacement filter applied through
 * `backdrop-filter: url(#filter)` (Chromium only - which is fine, WebHID only
 * exists there too). It only displaces; blur stays in CSS - see
 * `buildFilterMarkup` for why. This module is DOM-free math plus string builders so it
 * can be unit-tested; the DOM wiring lives in `useGlassRefraction`.
 */

export interface RefractionOptions {
  /** Element width in CSS px. */
  width: number;
  /** Element height in CSS px. */
  height: number;
  /** Corner radius in CSS px (clamped to half the shorter side). */
  radius: number;
  /** Width of the refracting bezel in CSS px. */
  bezel: number;
  /** Maximum sampling offset in CSS px, reached at the very edge. */
  strength: number;
  /**
   * Resolution of the generated map relative to CSS px. The map is a smooth
   * vector field, so a low resolution stretched by the filter is fine and cheap.
   */
  resolution?: number;
}

export interface DisplacementMap {
  /** RGBA pixels, `width * height * 4` bytes. R = x displacement, G = y displacement. */
  data: Uint8ClampedArray;
  width: number;
  height: number;
}

/**
 * Height-deficit profile of a convex bezel. `t` is 0 at the outer edge and 1 at
 * the inner edge of the bezel; the result goes from 1 (edge) to 0 (flat top).
 * A squared falloff keeps the lens strong at the rim and calm inside.
 */
export function bezelProfile(t: number): number {
  const clamped = Math.min(Math.max(t, 0), 1);
  const inv = 1 - clamped;
  return inv * inv;
}

/**
 * Signed distance from a point to a rounded rectangle centred on the origin,
 * plus the outward unit normal at that point.
 */
export function roundedRectSdf(
  px: number,
  py: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
): { distance: number; nx: number; ny: number } {
  const sx = px < 0 ? -1 : 1;
  const sy = py < 0 ? -1 : 1;
  const qx = Math.abs(px) - (halfWidth - radius);
  const qy = Math.abs(py) - (halfHeight - radius);

  if (qx > 0 && qy > 0) {
    const len = Math.hypot(qx, qy);
    return { distance: len - radius, nx: (qx / len) * sx, ny: (qy / len) * sy };
  }
  if (qx > qy) {
    return { distance: qx - radius, nx: sx, ny: 0 };
  }
  return { distance: qy - radius, nx: 0, ny: sy };
}

/** Clamp a requested corner radius so it always fits the box. */
export function clampRadius(radius: number, width: number, height: number): number {
  return Math.max(0, Math.min(radius, width / 2, height / 2));
}

/**
 * Builds the displacement map. Inside the bezel every pixel stores a vector that
 * points from the pixel towards the interior of the glass, scaled by the bezel
 * profile. `feDisplacementMap` then samples the backdrop from that inner
 * position, which magnifies and bends whatever sits behind the rim.
 * Outside the bezel the map is neutral (128/128) so the backdrop is untouched.
 */
export function computeDisplacementMap(options: RefractionOptions): DisplacementMap {
  const resolution = options.resolution ?? 0.5;
  const width = Math.max(1, Math.round(options.width * resolution));
  const height = Math.max(1, Math.round(options.height * resolution));
  const radius = clampRadius(options.radius, options.width, options.height);
  const bezel = Math.max(1, Math.min(options.bezel, Math.min(options.width, options.height) / 2));
  const halfWidth = options.width / 2;
  const halfHeight = options.height / 2;
  const data = new Uint8ClampedArray(width * height * 4);

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Pixel centre in CSS px, relative to the element centre.
      const px = (x + 0.5) / resolution - halfWidth;
      const py = (y + 0.5) / resolution - halfHeight;
      const { distance, nx, ny } = roundedRectSdf(px, py, halfWidth, halfHeight, radius);
      const depth = -distance; // > 0 inside the shape

      let vx = 0;
      let vy = 0;
      if (depth >= 0 && depth < bezel) {
        const magnitude = bezelProfile(depth / bezel);
        vx = -nx * magnitude;
        vy = -ny * magnitude;
      }

      const i = (y * width + x) * 4;
      data[i] = Math.round(127.5 * (1 + vx));
      data[i + 1] = Math.round(127.5 * (1 + vy));
      data[i + 2] = 128;
      data[i + 3] = 255;
    }
  }

  return { data, width, height };
}

export interface FilterMarkupOptions {
  /** Unique element id for the `<filter>`. */
  id: string;
  width: number;
  height: number;
  /** `data:` URL of the displacement map image. */
  href: string;
  /** Maximum sampling offset in CSS px (must match the map's `strength`). */
  strength: number;
  /** Optional saturation boost after displacement; omitted when 1. */
  saturation?: number;
}

/**
 * SVG `<filter>` element markup that displaces the backdrop with the map.
 *
 * It deliberately does NOT blur. The blur lives on the panel's ::before layer
 * (CSS `backdrop-filter: blur()`, which mirrors the backdrop at its edges). An
 * SVG blur would fade to transparent at the edges and leave a ~3-sigma wide
 * un-tinted band, and chaining `blur() url()` in one CSS declaration makes
 * Chromium evaluate the reference filter in a padded coordinate space, so the
 * map no longer lines up with the element. One layer per job avoids both.
 *
 * `feDisplacementMap` computes `P'(x,y) = P(x + scale * (C(x,y) - 0.5), ...)`.
 * The map stores `C = 0.5 + 0.5 * v`, so `scale = 2 * strength` yields a maximum
 * offset of exactly `strength` px.
 */
export function buildFilterMarkup(options: FilterMarkupOptions): string {
  const w = Math.max(1, Math.round(options.width));
  const h = Math.max(1, Math.round(options.height));
  const scale = (options.strength * 2).toFixed(2);
  const saturation = options.saturation ?? 1;
  const boost =
    Math.abs(saturation - 1) > 0.001
      ? `<feColorMatrix in="displaced" type="saturate" values="${saturation.toFixed(2)}"/>`
      : '';
  return (
    `<filter id="${options.id}" x="0" y="0" width="${w}" height="${h}" ` +
    `filterUnits="userSpaceOnUse" primitiveUnits="userSpaceOnUse" color-interpolation-filters="sRGB">` +
    `<feImage href="${options.href}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>` +
    `<feDisplacementMap in="SourceGraphic" in2="map" scale="${scale}" xChannelSelector="R" yChannelSelector="G" result="displaced"/>` +
    boost +
    `</filter>`
  );
}
