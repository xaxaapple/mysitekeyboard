import type { ContainerInit, RgbaColor } from './types';
import type { Rgb } from './color';

/** The kinds of surface the page turns into real Liquid DOM glass. */
export type PlateKind = 'panel' | 'control' | 'primary' | 'danger' | 'thumb';

export interface GlassTheme {
  isDark: boolean;
  primary: Rgb;
  destructive: Rgb;
}

const white = (a: number): RgbaColor => ({ r: 1, g: 1, b: 1, a });
const shadow = (a: number): RgbaColor => ({ r: 0, g: 0, b: 0, a });
const tinted = ({ r, g, b }: Rgb, a: number): RgbaColor => ({ r, g, b, a });

/** Draw order of the optical groups: later kinds are refracted through earlier ones. */
export const PLATE_ORDER: PlateKind[] = ['panel', 'control', 'primary', 'danger', 'thumb'];

/**
 * Optical settings per kind. The numbers follow the Liquid DOM showcase demos
 * (`blendSupportGating` off, `bezelWidth` scaled to the surface size, soft
 * shadow, `specularOpacity` 0.55-0.7) with the tint adapted to light and dark.
 */
export function getContainerOptions(kind: PlateKind, theme: GlassTheme): ContainerInit {
  const { isDark } = theme;
  const common: ContainerInit = {
    blendSupportGating: false,
    // Glass neighbours on a page are separate objects, not a fused blob.
    spacing: 2,
    normalGating: { enabled: true },
    surfaceProfile: 'convex',
  };

  switch (kind) {
    case 'panel':
      return {
        ...common,
        blur: 16,
        bezelWidth: 34,
        thickness: 70,
        displacementBlur: 10,
        tint: white(isDark ? 0.07 : 0.4),
        shadowColor: shadow(isDark ? 0.42 : 0.16),
        shadowOffsetY: 14,
        shadowBlur: 36,
        specularOpacity: isDark ? 0.55 : 0.75,
        specularStrength: 1,
        specularSharpness: 3,
        oppositeSpecularStrength: 0.5,
        zIndex: 0,
      };
    case 'control':
      return {
        ...common,
        blur: 8,
        bezelWidth: 16,
        thickness: 50,
        displacementBlur: 6,
        tint: white(isDark ? 0.16 : 0.5),
        shadowColor: shadow(isDark ? 0.4 : 0.18),
        shadowOffsetY: 6,
        shadowBlur: 16,
        specularOpacity: 0.65,
        zIndex: 1,
      };
    case 'primary':
      return {
        ...common,
        blur: 6,
        bezelWidth: 16,
        thickness: 50,
        displacementBlur: 6,
        tint: tinted(theme.primary, isDark ? 0.72 : 0.8),
        shadowColor: tinted(theme.primary, 0.32),
        shadowOffsetY: 8,
        shadowBlur: 18,
        specularOpacity: 0.7,
        zIndex: 2,
      };
    case 'danger':
      return {
        ...common,
        blur: 6,
        bezelWidth: 16,
        thickness: 50,
        displacementBlur: 6,
        tint: tinted(theme.destructive, isDark ? 0.72 : 0.8),
        shadowColor: tinted(theme.destructive, 0.32),
        shadowOffsetY: 8,
        shadowBlur: 18,
        specularOpacity: 0.7,
        zIndex: 3,
      };
    case 'thumb':
      return {
        ...common,
        blur: 3,
        bezelWidth: 12,
        thickness: 40,
        displacementBlur: 4,
        tint: white(isDark ? 0.22 : 0.62),
        shadowColor: shadow(isDark ? 0.5 : 0.24),
        shadowOffsetY: 4,
        shadowBlur: 10,
        specularOpacity: 0.75,
        zIndex: 4,
      };
  }
}

/** Matches the `[data-lg-plate]` attribute selectors used by the CSS overrides. */
export const PLATE_SELECTORS: Array<{ kind: PlateKind; selector: string }> = [
  { kind: 'panel', selector: '.lg-panel' },
  { kind: 'primary', selector: '.lg-btn-primary, .lg-tile-primary' },
  { kind: 'danger', selector: '.lg-btn-danger' },
  {
    kind: 'control',
    selector:
      '.lg-btn:not(.lg-btn-ghost):not(.lg-btn-link):not(.lg-btn-primary):not(.lg-btn-danger), .lg-tile:not(.lg-tile-primary)',
  },
  { kind: 'thumb', selector: '.lg-segmented-thumb' },
];

/**
 * Surfaces that must stay CSS glass: they float above the page's DOM content,
 * and DOM always paints above the WebGPU canvas, so canvas glass behind them
 * would let the page underneath show straight through.
 */
export const OVERLAY_SELECTOR = '.lg-scrim, .lg-popover, .lg-toast';
