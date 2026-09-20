import { describe, expect, test } from 'bun:test';
import {
  bezelProfile,
  buildFilterMarkup,
  clampRadius,
  computeDisplacementMap,
  roundedRectSdf,
} from './glassRefraction';

/** Read the (R, G) displacement channels of a pixel, addressed in CSS px. */
function pixelAt(
  map: ReturnType<typeof computeDisplacementMap>,
  resolution: number,
  x: number,
  y: number,
): { r: number; g: number } {
  const px = Math.min(map.width - 1, Math.floor(x * resolution));
  const py = Math.min(map.height - 1, Math.floor(y * resolution));
  const i = (py * map.width + px) * 4;
  return { r: map.data[i], g: map.data[i + 1] };
}

describe('bezelProfile', () => {
  test('is strongest at the edge and vanishes on the flat top', () => {
    expect(bezelProfile(0)).toBe(1);
    expect(bezelProfile(1)).toBe(0);
  });

  test('decreases monotonically', () => {
    let previous = bezelProfile(0);
    for (let t = 0.05; t <= 1; t += 0.05) {
      const value = bezelProfile(t);
      expect(value).toBeLessThanOrEqual(previous);
      previous = value;
    }
  });

  test('clamps out-of-range input', () => {
    expect(bezelProfile(-3)).toBe(1);
    expect(bezelProfile(7)).toBe(0);
  });
});

describe('roundedRectSdf', () => {
  test('is negative inside and equals minus the half height at the centre', () => {
    const { distance } = roundedRectSdf(0, 0, 100, 50, 20);
    expect(distance).toBe(-50);
  });

  test('is zero on a straight edge and the normal points outward', () => {
    const right = roundedRectSdf(100, 0, 100, 50, 20);
    expect(right.distance).toBe(0);
    expect(right.nx).toBe(1);
    expect(right.ny).toBe(0);

    const top = roundedRectSdf(0, -50, 100, 50, 20);
    expect(top.distance).toBe(0);
    expect(top.nx).toBe(0);
    expect(top.ny).toBe(-1);
  });

  test('uses a diagonal normal inside a rounded corner', () => {
    // Corner arc centre is at (80, 30); step 20 * cos/sin(45deg) away from it.
    const offset = 20 * Math.SQRT1_2;
    const { distance, nx, ny } = roundedRectSdf(80 + offset, 30 + offset, 100, 50, 20);
    expect(distance).toBeCloseTo(0, 6);
    expect(nx).toBeCloseTo(Math.SQRT1_2, 6);
    expect(ny).toBeCloseTo(Math.SQRT1_2, 6);
  });
});

describe('clampRadius', () => {
  test('never exceeds half the shorter side', () => {
    expect(clampRadius(999, 200, 100)).toBe(50);
    expect(clampRadius(12, 200, 100)).toBe(12);
    expect(clampRadius(-5, 200, 100)).toBe(0);
  });
});

describe('computeDisplacementMap', () => {
  const resolution = 1;
  const map = computeDisplacementMap({ width: 200, height: 120, radius: 30, bezel: 24, strength: 10, resolution });

  test('has the requested size and an opaque alpha channel', () => {
    expect(map.width).toBe(200);
    expect(map.height).toBe(120);
    expect(map.data.length).toBe(200 * 120 * 4);
    for (let i = 3; i < map.data.length; i += 4) {
      expect(map.data[i]).toBe(255);
    }
  });

  test('is neutral (no displacement) in the flat interior', () => {
    const { r, g } = pixelAt(map, resolution, 100, 60);
    expect(r).toBe(128);
    expect(g).toBe(128);
  });

  test('vectors point towards the interior along every edge', () => {
    const left = pixelAt(map, resolution, 1, 60);
    const right = pixelAt(map, resolution, 198, 60);
    const top = pixelAt(map, resolution, 100, 1);
    const bottom = pixelAt(map, resolution, 100, 118);

    expect(left.r).toBeGreaterThan(128 + 100); // +x
    expect(right.r).toBeLessThan(128 - 100); // -x
    expect(top.g).toBeGreaterThan(128 + 100); // +y (down)
    expect(bottom.g).toBeLessThan(128 - 100); // -y (up)
  });

  test('displacement fades out across the bezel', () => {
    const edge = pixelAt(map, resolution, 2, 60).r - 128;
    const middle = pixelAt(map, resolution, 12, 60).r - 128;
    const inner = pixelAt(map, resolution, 23, 60).r - 128;
    expect(edge).toBeGreaterThan(middle);
    expect(middle).toBeGreaterThan(inner);
  });

  test('a lower resolution produces a proportionally smaller map', () => {
    const half = computeDisplacementMap({ width: 200, height: 120, radius: 30, bezel: 24, strength: 10, resolution: 0.5 });
    expect(half.width).toBe(100);
    expect(half.height).toBe(60);
  });
});

describe('buildFilterMarkup', () => {
  const markup = buildFilterMarkup({
    id: 'lg-refract-7',
    width: 320.4,
    height: 180.6,
    href: 'data:image/png;base64,AAAA',
    strength: 12,
    saturation: 1.7,
  });

  test('declares the filter in user space with a matching id and rounded size', () => {
    expect(markup).toContain('id="lg-refract-7"');
    expect(markup).toContain('filterUnits="userSpaceOnUse"');
    expect(markup).toContain('width="320"');
    expect(markup).toContain('height="181"');
  });

  test('doubles the strength for feDisplacementMap and reads R/G channels', () => {
    expect(markup).toContain('scale="24.00"');
    expect(markup).toContain('xChannelSelector="R"');
    expect(markup).toContain('yChannelSelector="G"');
  });

  test('embeds the map and the saturation boost', () => {
    expect(markup).toContain('href="data:image/png;base64,AAAA"');
    expect(markup).toContain('values="1.70"');
  });

  test('only displaces: blur is left to CSS', () => {
    expect(markup).not.toContain('feGaussianBlur');
    expect(markup).toContain('<feDisplacementMap in="SourceGraphic"');
  });

  test('skips the saturation primitive when it would be a no-op', () => {
    const plain = buildFilterMarkup({
      id: 'lg-refract-8',
      width: 100,
      height: 100,
      href: 'data:,',
      strength: 8,
    });
    expect(plain).not.toContain('feColorMatrix');
  });
});
});
