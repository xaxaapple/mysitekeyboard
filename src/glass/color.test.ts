import { describe, expect, test } from 'bun:test';
import { hslToRgb, rgbCss, rgbToHsl } from './color';

describe('rgbToHsl / hslToRgb', () => {
  test('round-trips a saturated colour', () => {
    const original = { r: 0.04, g: 0.52, b: 1 };
    const { h, s, l } = rgbToHsl(original);
    const back = hslToRgb(h, s, l);
    expect(back.r).toBeCloseTo(original.r, 5);
    expect(back.g).toBeCloseTo(original.g, 5);
    expect(back.b).toBeCloseTo(original.b, 5);
  });

  test('treats greys as achromatic', () => {
    const { s } = rgbToHsl({ r: 0.5, g: 0.5, b: 0.5 });
    expect(s).toBe(0);
  });

  test('wraps hue rotations past 360 degrees', () => {
    const a = hslToRgb(30, 0.8, 0.5);
    const b = hslToRgb(390, 0.8, 0.5);
    expect(b.r).toBeCloseTo(a.r, 6);
    expect(b.g).toBeCloseTo(a.g, 6);
    expect(b.b).toBeCloseTo(a.b, 6);
  });
});

describe('rgbCss', () => {
  test('formats 0..1 channels as 8-bit CSS with alpha', () => {
    expect(rgbCss({ r: 1, g: 0.5, b: 0 }, 0.25)).toBe('rgb(255 128 0 / 0.25)');
  });
});
