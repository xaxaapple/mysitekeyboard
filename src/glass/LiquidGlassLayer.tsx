import { useEffect } from 'react';
import { LiquidGlassEngine } from './LiquidGlassEngine';

/**
 * Mounts the Liquid DOM WebGPU renderer behind the page.
 *
 * While it is not running (no WebGPU, reduced transparency, device lost) the
 * CSS glass from `liquid-glass.css` is used instead, so the UI never depends
 * on it. Renders nothing.
 */
export function LiquidGlassLayer() {
  useEffect(() => {
    const root = document.documentElement;
    if (window.matchMedia('(prefers-reduced-transparency: reduce)').matches) return;

    let cancelled = false;
    let engine: LiquidGlassEngine | null = null;

    const dispose = () => {
      root.classList.remove('lg-gpu');
      engine?.destroy();
      engine = null;
    };

    void LiquidGlassEngine.create(dispose).then((created) => {
      if (!created) return;
      if (cancelled) {
        created.destroy();
        return;
      }
      engine = created;
    });

    return () => {
      cancelled = true;
      dispose();
    };
  }, []);

  return null;
}
