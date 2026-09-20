import { useEffect } from 'react';

const SURFACES = '.lg-panel, .lg-btn';

/**
 * Makes the specular highlight follow the pointer, like light sliding across
 * real glass. It only writes two CSS variables (`--mx`, `--my`) on the surfaces
 * under the cursor; the highlight itself is a background layer in
 * liquid-glass.css, so nothing is re-laid-out.
 */
export function useSpecularPointer(): void {
  useEffect(() => {
    let frame = 0;
    let pending: PointerEvent | null = null;

    const flush = () => {
      frame = 0;
      const event = pending;
      pending = null;
      if (!event || !(event.target instanceof Element)) return;

      // Update every surface under the pointer (a button inside a panel, etc.).
      let surface = event.target.closest<HTMLElement>(SURFACES);
      while (surface) {
        const rect = surface.getBoundingClientRect();
        surface.style.setProperty('--mx', `${event.clientX - rect.left}px`);
        surface.style.setProperty('--my', `${event.clientY - rect.top}px`);
        surface = surface.parentElement?.closest<HTMLElement>(SURFACES) ?? null;
      }
    };

    const onMove = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      pending = event;
      if (!frame) frame = requestAnimationFrame(flush);
    };

    const onOut = (event: PointerEvent) => {
      if (!(event.target instanceof Element)) return;
      const surface = event.target.closest<HTMLElement>(SURFACES);
      const next = event.relatedTarget;
      if (surface && !(next instanceof Node && surface.contains(next))) {
        surface.style.removeProperty('--mx');
        surface.style.removeProperty('--my');
      }
    };

    document.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('pointerout', onOut, { passive: true });
    return () => {
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerout', onOut);
      if (frame) cancelAnimationFrame(frame);
    };
  }, []);
}
