import {
  Container,
  Glass,
  Scene,
  WebGpuGlassCore,
} from '@/vendor/liquid-dom/core';
import { parseCssColor, type Rgb } from './color';
import {
  getContainerOptions,
  OVERLAY_SELECTOR,
  PLATE_ORDER,
  PLATE_SELECTORS,
  type GlassTheme,
  type PlateKind,
} from './glassPresets';
import { drawWallpaper } from './wallpaper';

/** Light comes from the top-left by default; the pointer swings it like a lamp. */
const DEFAULT_LIGHT_DIRECTION = -Math.PI / 4;
const MAX_DPR = 2;
/** Plates this far outside the viewport are detached from the scene. */
const CULL_MARGIN = 96;

const FALLBACK_PRIMARY: Rgb = { r: 0.04, g: 0.52, b: 1 };
const FALLBACK_DESTRUCTIVE: Rgb = { r: 1, g: 0.27, b: 0.23 };

/** One DOM element that is drawn as a real Liquid DOM `Glass`. */
interface Plate {
  element: HTMLElement;
  kind: PlateKind;
  glass: Glass;
  attached: boolean;
  /** Ancestors that clip the element (overflow other than `visible`). */
  clippers: HTMLElement[];
  radius: number;
  radiusKey: string;
  rectKey: string;
}

/**
 * Renders the page's glass surfaces with the real Liquid DOM WebGPU core.
 *
 * Liquid DOM normally hosts DOM content inside its own canvas through the
 * experimental HTML-in-Canvas API. This adapter uses the same renderer
 * (`WebGpuGlassCore`, the same scene graph and shaders) in the way the Three.js
 * adapter does: the core composites glass over a backdrop texture. The
 * backdrop is the page wallpaper, and every glass shape is placed over a DOM
 * element (a "plate"), so the DOM keeps its normal scrolling, layout and
 * accessibility while the glass itself is drawn by Liquid DOM. No browser flag
 * is needed, only WebGPU.
 */
export class LiquidGlassEngine {
  private readonly device: GPUDevice;
  private readonly context: GPUCanvasContext;
  private readonly format: GPUTextureFormat;
  private readonly canvas: HTMLCanvasElement;
  private readonly core: WebGpuGlassCore;
  private readonly scene = new Scene();
  private readonly containers = new Map<PlateKind, Container>();
  private readonly plates = new Map<HTMLElement, Plate>();
  private readonly wallpaperCanvas = document.createElement('canvas');
  private readonly wallpaperContext: CanvasRenderingContext2D;

  private backdrop: GPUTexture | null = null;
  private deviceWidth = 0;
  private deviceHeight = 0;
  private cssWidth = 0;
  private cssHeight = 0;
  private dpr = 1;

  private theme: GlassTheme;
  private themeKey = '';
  private themeDirty = true;
  private lightDirection = DEFAULT_LIGHT_DIRECTION;
  private lightTarget = DEFAULT_LIGHT_DIRECTION;

  private frame = 0;
  private dirty = true;
  private scanPending = true;
  private destroyed = false;
  private hasRendered = false;

  private readonly mutationObserver: MutationObserver;
  private readonly themeObserver: MutationObserver;
  private readonly onLost: (() => void) | undefined;

  private constructor(device: GPUDevice, onLost?: () => void) {
    this.device = device;
    this.onLost = onLost;
    this.format = navigator.gpu.getPreferredCanvasFormat();

    this.canvas = document.createElement('canvas');
    this.canvas.className = 'lg-gpu-canvas';
    this.canvas.setAttribute('aria-hidden', 'true');
    Object.assign(this.canvas.style, {
      position: 'fixed',
      inset: '0',
      width: '100%',
      height: '100%',
      zIndex: '-1',
      pointerEvents: 'none',
    });

    const context = this.canvas.getContext('webgpu');
    if (!context) throw new Error('WebGPU canvas context is unavailable.');
    this.context = context;
    this.context.configure({ device, format: this.format, alphaMode: 'opaque' });

    const wallpaperContext = this.wallpaperCanvas.getContext('2d');
    if (!wallpaperContext) throw new Error('2D canvas is unavailable.');
    this.wallpaperContext = wallpaperContext;

    this.core = new WebGpuGlassCore({ device, format: this.format });
    this.theme = this.readTheme();

    for (const kind of PLATE_ORDER) {
      const container = new Container(getContainerOptions(kind, this.theme));
      container.lightDirection = this.lightDirection;
      this.containers.set(kind, container);
      this.scene.add(container);
    }

    this.mutationObserver = new MutationObserver(() => {
      this.scanPending = true;
    });
    this.themeObserver = new MutationObserver(() => {
      this.themeDirty = true;
    });
  }

  /** Resolves to `null` when WebGPU is not available or fails to initialise. */
  static async create(onLost?: () => void): Promise<LiquidGlassEngine | null> {
    if (typeof navigator === 'undefined' || !('gpu' in navigator)) return null;

    try {
      const adapter = await navigator.gpu.requestAdapter();
      if (!adapter) return null;
      const device = await adapter.requestDevice();
      const engine = new LiquidGlassEngine(device, onLost);
      engine.start();
      return engine;
    } catch (error) {
      console.warn('Liquid Glass: WebGPU initialisation failed, using CSS glass.', error);
      return null;
    }
  }

  /** True once the first frame has been drawn (the CSS glass can step aside). */
  get ready(): boolean {
    return this.hasRendered;
  }

  /** Called by the host when the layout may have changed (route changes etc.). */
  invalidate(): void {
    this.scanPending = true;
    this.dirty = true;
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    cancelAnimationFrame(this.frame);
    this.mutationObserver.disconnect();
    this.themeObserver.disconnect();
    window.removeEventListener('resize', this.handleResize);
    window.removeEventListener('scroll', this.markDirty, true);
    document.removeEventListener('pointermove', this.handlePointerMove);
    document.documentElement.removeEventListener('pointerleave', this.handlePointerLeave);
    document.removeEventListener('visibilitychange', this.markDirty);

    for (const plate of this.plates.values()) this.releasePlate(plate);
    this.plates.clear();
    this.canvas.remove();

    // After a lost device these calls may throw; the page must survive that.
    try {
      this.core.destroy();
      this.backdrop?.destroy();
      this.device.destroy();
    } catch (error) {
      console.warn('Liquid Glass: GPU teardown failed.', error);
    }
    this.backdrop = null;
  }

  // --- Lifecycle ----------------------------------------------------------

  private start(): void {
    document.body.prepend(this.canvas);
    this.resize();

    window.addEventListener('resize', this.handleResize);
    window.addEventListener('scroll', this.markDirty, { capture: true, passive: true });
    document.addEventListener('pointermove', this.handlePointerMove, { passive: true });
    document.documentElement.addEventListener('pointerleave', this.handlePointerLeave);
    document.addEventListener('visibilitychange', this.markDirty);

    this.mutationObserver.observe(document.body, { childList: true, subtree: true });
    this.themeObserver.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['class', 'style'],
    });

    void this.device.lost.then(() => {
      if (!this.destroyed) this.onLost?.();
    });

    this.frame = requestAnimationFrame(this.tick);
  }

  private readonly markDirty = () => {
    this.dirty = true;
  };

  private readonly handleResize = () => {
    this.resize();
  };

  private readonly handlePointerMove = (event: PointerEvent) => {
    if (event.pointerType === 'touch') return;
    const progress = Math.min(1, Math.max(0, event.clientX / Math.max(1, window.innerWidth)));
    this.lightTarget = progress * Math.PI - Math.PI / 2;
  };

  private readonly handlePointerLeave = () => {
    this.lightTarget = DEFAULT_LIGHT_DIRECTION;
  };

  // --- Frame loop ---------------------------------------------------------

  private readonly tick = () => {
    if (this.destroyed) return;
    this.frame = requestAnimationFrame(this.tick);
    if (document.hidden) return;

    if (this.scanPending) {
      this.scanPending = false;
      this.scan();
    }

    const themeChanged = this.refreshTheme();
    const platesChanged = this.syncPlates();
    const lightChanged = this.updateLight();

    if (this.dirty || themeChanged || platesChanged || lightChanged) {
      this.dirty = false;
      this.render();
    }
  };

  private render(): void {
    if (!this.backdrop) return;

    this.core.render({
      scene: this.scene,
      width: this.deviceWidth,
      height: this.deviceHeight,
      dpr: this.dpr,
      outputTexture: this.context.getCurrentTexture(),
      backdropTexture: this.backdrop,
    });

    if (!this.hasRendered) {
      this.hasRendered = true;
      document.documentElement.classList.add('lg-gpu');
    }
  }

  // --- Sizing and backdrop --------------------------------------------------

  private resize(): void {
    const cssWidth = Math.max(1, window.innerWidth);
    const cssHeight = Math.max(1, window.innerHeight);
    const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
    const deviceWidth = Math.max(1, Math.round(cssWidth * dpr));
    const deviceHeight = Math.max(1, Math.round(cssHeight * dpr));

    if (deviceWidth === this.deviceWidth && deviceHeight === this.deviceHeight && dpr === this.dpr) return;

    this.cssWidth = cssWidth;
    this.cssHeight = cssHeight;
    this.dpr = dpr;
    this.deviceWidth = deviceWidth;
    this.deviceHeight = deviceHeight;
    this.canvas.width = deviceWidth;
    this.canvas.height = deviceHeight;

    this.backdrop?.destroy();
    this.backdrop = this.device.createTexture({
      size: [deviceWidth, deviceHeight],
      format: 'rgba8unorm',
      usage:
        GPUTextureUsage.TEXTURE_BINDING |
        GPUTextureUsage.COPY_DST |
        GPUTextureUsage.RENDER_ATTACHMENT,
    });

    this.wallpaperCanvas.width = deviceWidth;
    this.wallpaperCanvas.height = deviceHeight;
    this.paintWallpaper();
    this.dirty = true;
  }

  private paintWallpaper(): void {
    if (!this.backdrop) return;

    const ctx = this.wallpaperContext;
    ctx.save();
    ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    drawWallpaper(ctx, this.cssWidth, this.cssHeight, this.theme);
    ctx.restore();

    this.device.queue.copyExternalImageToTexture(
      { source: this.wallpaperCanvas },
      { texture: this.backdrop },
      [this.deviceWidth, this.deviceHeight],
    );
  }

  // --- Theme ----------------------------------------------------------------

  private readTheme(): GlassTheme {
    const root = document.documentElement;
    const styles = getComputedStyle(root);
    return {
      isDark: root.classList.contains('dark'),
      primary: parseCssColor(styles.getPropertyValue('--primary'), FALLBACK_PRIMARY),
      destructive: parseCssColor(styles.getPropertyValue('--destructive'), FALLBACK_DESTRUCTIVE),
    };
  }

  /** Re-reads the theme and restyles containers + wallpaper when it changed. */
  private refreshTheme(): boolean {
    if (!this.themeDirty) return false;
    this.themeDirty = false;

    const theme = this.readTheme();
    const key = [theme.isDark, ...Object.values(theme.primary), ...Object.values(theme.destructive)]
      .map((value) => (typeof value === 'number' ? value.toFixed(3) : String(value)))
      .join('|');
    if (key === this.themeKey) return false;

    this.themeKey = key;
    this.theme = theme;

    for (const [kind, container] of this.containers) {
      const { tint, shadowColor, specularOpacity } = getContainerOptions(kind, theme);
      if (tint) container.tint = tint;
      if (shadowColor) container.shadowColor = shadowColor;
      if (specularOpacity !== undefined) container.specularOpacity = specularOpacity;
    }

    this.paintWallpaper();
    return true;
  }

  private updateLight(): boolean {
    const delta = this.lightTarget - this.lightDirection;
    if (Math.abs(delta) < 0.0005) return false;

    this.lightDirection += delta * 0.14;
    for (const container of this.containers.values()) container.lightDirection = this.lightDirection;
    return true;
  }

  // --- Plates ---------------------------------------------------------------

  private isEligible(element: HTMLElement, kind: PlateKind): boolean {
    if (element.closest(OVERLAY_SELECTOR)) return false;
    // Nested panels stay CSS tint: canvas glass cannot sit above a parent's DOM.
    if (kind === 'panel' && element.parentElement?.closest('.lg-panel')) return false;
    return true;
  }

  /** Diffs the DOM against the registered plates. */
  private scan(): void {
    const found = new Map<HTMLElement, PlateKind>();
    for (const { kind, selector } of PLATE_SELECTORS) {
      for (const element of document.querySelectorAll<HTMLElement>(selector)) {
        if (!found.has(element) && this.isEligible(element, kind)) found.set(element, kind);
      }
    }

    for (const [element, plate] of this.plates) {
      if (!found.has(element) || found.get(element) !== plate.kind || !element.isConnected) {
        this.releasePlate(plate);
        this.plates.delete(element);
      }
    }

    for (const [element, kind] of found) {
      if (this.plates.has(element)) continue;
      const glass = new Glass({ width: 0, height: 0 });
      element.dataset.lgPlate = kind;
      this.plates.set(element, {
        element,
        kind,
        glass,
        attached: false,
        clippers: this.findClippers(element),
        radius: 0,
        radiusKey: '',
        rectKey: '',
      });
    }
    this.dirty = true;
  }

  private findClippers(element: HTMLElement): HTMLElement[] {
    const clippers: HTMLElement[] = [];
    for (let node = element.parentElement; node && node !== document.body; node = node.parentElement) {
      const { overflowX, overflowY } = getComputedStyle(node);
      if (overflowX !== 'visible' || overflowY !== 'visible') clippers.push(node);
    }
    return clippers;
  }

  private releasePlate(plate: Plate): void {
    if (plate.attached) plate.glass.remove();
    plate.attached = false;
    delete plate.element.dataset.lgPlate;
  }

  /** Moves every glass onto its element. Returns true when anything changed. */
  private syncPlates(): boolean {
    let changed = false;
    const viewportWidth = this.cssWidth;
    const viewportHeight = this.cssHeight;

    // Read phase: all layout reads happen before any scene writes.
    const measured: Array<{ plate: Plate; rect: DOMRect; visible: boolean }> = [];
    for (const plate of this.plates.values()) {
      const { element } = plate;
      const rect = element.getBoundingClientRect();
      let visible =
        rect.width > 1 &&
        rect.height > 1 &&
        rect.bottom > -CULL_MARGIN &&
        rect.top < viewportHeight + CULL_MARGIN &&
        rect.right > -CULL_MARGIN &&
        rect.left < viewportWidth + CULL_MARGIN;

      if (visible && typeof element.checkVisibility === 'function') {
        visible = element.checkVisibility({ checkVisibilityCSS: true, checkOpacity: true });
      }
      if (visible) {
        for (const clipper of plate.clippers) {
          const clip = clipper.getBoundingClientRect();
          if (
            rect.right <= clip.left ||
            rect.left >= clip.right ||
            rect.bottom <= clip.top ||
            rect.top >= clip.bottom
          ) {
            visible = false;
            break;
          }
        }
      }
      measured.push({ plate, rect, visible });
    }

    for (const { plate, rect, visible } of measured) {
      if (!visible) {
        if (plate.attached) {
          plate.glass.remove();
          plate.attached = false;
          changed = true;
        }
        continue;
      }

      const rectKey = `${rect.left.toFixed(2)}|${rect.top.toFixed(2)}|${rect.width.toFixed(2)}|${rect.height.toFixed(2)}`;
      if (rectKey !== plate.rectKey) {
        plate.rectKey = rectKey;

        const radiusKey = `${Math.round(rect.width)}x${Math.round(rect.height)}`;
        if (radiusKey !== plate.radiusKey) {
          plate.radiusKey = radiusKey;
          plate.radius = parseFloat(getComputedStyle(plate.element).borderTopLeftRadius) || 0;
        }

        plate.glass.x = rect.left;
        plate.glass.y = rect.top;
        plate.glass.width = rect.width;
        plate.glass.height = rect.height;
        plate.glass.cornerRadius = Math.min(plate.radius, rect.width / 2, rect.height / 2);
        changed = true;
      }

      if (!plate.attached) {
        this.containers.get(plate.kind)?.add(plate.glass);
        plate.attached = true;
        changed = true;
      }
    }

    return changed;
  }
}
