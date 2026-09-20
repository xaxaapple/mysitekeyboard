/** Circular rounded corners use the Euclidean p-norm exponent. */
export const CIRCULAR_CORNER_EXPONENT = 2
/** Smooth-corner value tuned as the default iOS-like shape. */
export const DEFAULT_CORNER_SMOOTHING = 0.6
/** p-norm exponent that approximates the classic squircle shape at the default smoothing value. */
export const IOS_LIKE_CORNER_EXPONENT = 4
/**
 * Amount added to the p-norm exponent per unit of effective corner smoothing.
 *
 * This is derived rather than hand-picked so the public default smoothing value
 * maps exactly to exponent 4, while smoothing 0 stays circular at exponent 2.
 */
export const CORNER_SMOOTHING_EXPONENT_DELTA =
  (IOS_LIKE_CORNER_EXPONENT - CIRCULAR_CORNER_EXPONENT) / DEFAULT_CORNER_SMOOTHING

export function sanitizeCornerRadius(radius: number) {
  return Number.isFinite(radius) ? Math.max(radius, 0) : 0
}

export function sanitizeCornerSmoothing(smoothing: number) {
  return Number.isFinite(smoothing) ? Math.min(Math.max(smoothing, 0), 1) : DEFAULT_CORNER_SMOOTHING
}

export function resolveCornerSmoothingExponent(cornerSmoothing: number) {
  return CIRCULAR_CORNER_EXPONENT +
    sanitizeCornerSmoothing(cornerSmoothing) * CORNER_SMOOTHING_EXPONENT_DELTA
}
