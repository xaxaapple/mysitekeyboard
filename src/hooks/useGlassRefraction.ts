import { useEffect, type RefObject } from 'react';
import {
  buildFilterMarkup,
  clampRadius,
  computeDisplacementMap,
} from '@/utils/glassRefraction';

export interface UseGlassRefractionOptions {
  /** Turn refraction on or off without unmounting the element. */
  enabled?: boolean;
  /** Width of the refracting rim in CSS px. */
  bezel?: number;
  /** Maximum backdrop sampling offset in CSS px. */
  strength?: number;
  /** Optional saturation boost applied at the rim (1 = none). */
  saturation?: number;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
let filterHost: SVGSVGElement | null = null;
let filterCounter = 0;

/**
 * SVG filters inside `backdrop-filter` are a Chromium feature. Elsewhere the
 * plain blur + tint + specular rim from liquid-glass.css is used instead.
 */
export function supportsGlassRefraction(): boolean {
  if (typeof window === 'undefined' || typeof CSS === 'undefined') return false;
  if (window.matchMedia?.('(prefers-reduced-transparency: reduce)').matches) return false;

  const brands = (navigator as Navigator & { userAgentData?: { brands: Array<{ brand: string }> } })
    .userAgentData?.brands;
  const isChromium = brands
    ? brands.some((entry) => /Chromium/i.test(entry.brand))
    : /Chrome\//.test(navigator.userAgent);

  return isChromium && CSS.supports('backdrop-filter', 'blur(1px)');
}

/** One hidden <svg> holds every per-element filter definition. */
function getFilterHost(): SVGSVGElement {
  if (filterHost && filterHost.isConnected) return filterHost;

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('width', '0');
  svg.setAttribute('height', '0');
  svg.style.position = 'absolute';
  svg.style.pointerEvents = 'none';
  document.body.appendChild(svg);
  filterHost = svg;
  return svg;
}

function mapToDataUrl(data: Uint8ClampedArray, width: number, height: number): string | null {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) return null;
  context.putImageData(new ImageData(new Uint8ClampedArray(data), width, height), 0, 0);
  return canvas.toDataURL();
}

/**
 * Adds Liquid Glass edge refraction to a panel.
 *
 * Pass the ref of the panel's `<span class="lg-refract">` layer (rendered by
 * `<Card refract>`; add it by hand for other panels). The hook measures the
 * layer, generates a displacement map matching its size and corner radius,
 * registers an SVG filter and points `backdrop-filter` at it. The map is
 * regenerated whenever the layer is resized.
 *
 * Only use it on top-level panels: a panel nested inside another one has no
 * wallpaper to refract (`.lg-refract` is hidden there by CSS).
 */
export function useGlassRefraction<T extends HTMLElement>(
  ref: RefObject<T | null>,
  { enabled = true, bezel = 30, strength = 20, saturation = 1.15 }: UseGlassRefractionOptions = {},
): void {
  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !supportsGlassRefraction()) return;

    const filterId = `lg-refract-${++filterCounter}`;
    let filterElement: Element | null = null;
    let lastKey = '';
    let frame = 0;

    const update = () => {
      frame = 0;
      const width = element.offsetWidth;
      const height = element.offsetHeight;
      if (width < 16 || height < 16) return;

      const cornerRadius = parseFloat(getComputedStyle(element).borderTopLeftRadius);
      const radius = clampRadius(Number.isFinite(cornerRadius) ? cornerRadius : 24, width, height);
      const key = `${width}x${height}@${radius}`;
      if (key === lastKey) return;

      const map = computeDisplacementMap({ width, height, radius, bezel, strength, resolution: 0.5 });
      const href = mapToDataUrl(map.data, map.width, map.height);
      if (!href) return;

      const holder = document.createElementNS(SVG_NS, 'svg');
      holder.innerHTML = buildFilterMarkup({ id: filterId, width, height, href, strength, saturation });
      const next = holder.firstElementChild;
      if (!next) return;

      const host = getFilterHost();
      if (filterElement && filterElement.parentNode === host) {
        host.replaceChild(next, filterElement);
      } else {
        host.appendChild(next);
      }
      filterElement = next;
      lastKey = key;
      element.style.backdropFilter = `url(#${filterId})`;
    };

    const schedule = () => {
      if (!frame) frame = requestAnimationFrame(update);
    };

    const observer = new ResizeObserver(schedule);
    observer.observe(element);
    schedule();

    return () => {
      observer.disconnect();
      if (frame) cancelAnimationFrame(frame);
      filterElement?.remove();
      element.style.backdropFilter = '';
    };
  }, [ref, enabled, bezel, strength, saturation]);
}
