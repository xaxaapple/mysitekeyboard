import { resolveCornerSmoothingExponent } from '../corner-smoothing'
import { invertMatrix, multiplyMatrices, transformPoint, type Matrix2D } from '../matrix'
import { flattenContainerGlasses, type Container, type Glass } from '../scene'

const SDF_EPSILON = 0.0001

/** Flattened container with the world transform used for hit testing. */
export type FlattenedContainer = {
  container: Container
  transform: Matrix2D
}

/** Cached geometry and transform data for pointer interaction with one glass. */
export type GlassInteractionEntry = {
  glass: Glass
  container: Container
  containerOrder: number
  glassOrder: number
  transform: Matrix2D
  inverseTransform: Matrix2D
  halfWidth: number
  halfHeight: number
  cornerRadius: number
  cornerSmoothing: number
}

/** Canvas-relative pointer coordinates paired with the original DOM event. */
export type PointerSnapshot = {
  nativeEvent: PointerEvent
  canvasX: number
  canvasY: number
}

/** Mutable pointer interaction state tracked per native pointer id. */
export type PointerState = {
  hoveredGlass: Glass | null
  capturedGlass: Glass | null
  capturedWithNativePointerCapture: boolean
  pressedGlass: Glass | null
  lastSnapshot: PointerSnapshot | null
}

function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max)
}

function superellipseLength(x: number, y: number, exponent: number) {
  return (Math.abs(x) ** exponent + Math.abs(y) ** exponent) ** (1 / exponent)
}

// Mirrors the WGSL shape SDF in ../shaders.ts for pointer hit testing.
function sdSmoothRoundRect(
  localX: number,
  localY: number,
  halfWidth: number,
  halfHeight: number,
  radius: number,
  cornerSmoothing: number,
) {
  const cornerLimit = Math.min(halfWidth, halfHeight)
  const clampedRadius = Math.min(Math.max(radius, 0), cornerLimit)
  const qx = Math.abs(localX) - halfWidth + clampedRadius
  const qy = Math.abs(localY) - halfHeight + clampedRadius
  const maxSmoothingThatFits = radius > SDF_EPSILON
    ? Math.max(cornerLimit / Math.max(radius, SDF_EPSILON) - 1, 0)
    : 0
  const effectiveSmoothing = Math.min(clamp(cornerSmoothing, 0, 1), maxSmoothingThatFits)
  const exponent = resolveCornerSmoothingExponent(effectiveSmoothing)
  const cornerDistance = superellipseLength(Math.max(qx, 0), Math.max(qy, 0), exponent)

  return cornerDistance + Math.min(Math.max(qx, qy), 0) - clampedRadius
}

/** Converts a 2D matrix into the CSS matrix() transform syntax. */
export function matrixToCssTransform(matrix: Matrix2D) {
  return `matrix(${matrix.a}, ${matrix.b}, ${matrix.c}, ${matrix.d}, ${matrix.e}, ${matrix.f})`
}

/** Builds the ordered hit-test cache for every pointer-enabled glass. */
export function createGlassInteractionEntries(containers: FlattenedContainer[]) {
  const entriesByGlass = new Map<Glass, GlassInteractionEntry>()
  const orderedEntries: GlassInteractionEntry[] = []

  for (let containerOrder = 0; containerOrder < containers.length; containerOrder += 1) {
    const entry = containers[containerOrder]

    for (const glassLayer of flattenContainerGlasses(entry.container)) {
      const glass = glassLayer.glass
      if (!glass.pointerEvents || glass.width <= 0 || glass.height <= 0) {
        continue
      }

      const transform = multiplyMatrices(entry.transform, glassLayer.transform)
      const inverseTransform = invertMatrix(transform)
      if (!inverseTransform) {
        continue
      }

      const interactionEntry = {
        glass,
        container: entry.container,
        containerOrder,
        glassOrder: glassLayer.traversalIndex,
        transform,
        inverseTransform,
        halfWidth: glass.width * 0.5,
        halfHeight: glass.height * 0.5,
        cornerRadius: glass.cornerRadius,
        cornerSmoothing: glass.cornerSmoothing,
      } satisfies GlassInteractionEntry

      entriesByGlass.set(glass, interactionEntry)
      orderedEntries.push(interactionEntry)
    }
  }

  orderedEntries.sort(
    (left, right) =>
      left.containerOrder - right.containerOrder ||
      left.glassOrder - right.glassOrder,
  )

  return {
    entriesByGlass,
    orderedEntries,
  }
}

/** Measures a canvas point in a glass interaction entry's local space. */
export function measureGlassInteractionEntry(entry: GlassInteractionEntry, canvasX: number, canvasY: number) {
  const localPoint = transformPoint(entry.inverseTransform, canvasX, canvasY)
  const centeredX = localPoint.x - entry.halfWidth
  const centeredY = localPoint.y - entry.halfHeight
  return {
    localX: localPoint.x,
    localY: localPoint.y,
    inside:
      sdSmoothRoundRect(
        centeredX,
        centeredY,
        entry.halfWidth,
        entry.halfHeight,
        entry.cornerRadius,
        entry.cornerSmoothing,
      ) <= 0,
  }
}

/** Returns the topmost glass interaction entry containing a canvas point. */
export function hitTestGlassInteractionEntries(
  entries: GlassInteractionEntry[],
  canvasX: number,
  canvasY: number,
) {
  for (let index = entries.length - 1; index >= 0; index -= 1) {
    const entry = entries[index]
    if (measureGlassInteractionEntry(entry, canvasX, canvasY).inside) {
      return entry
    }
  }

  return null
}
