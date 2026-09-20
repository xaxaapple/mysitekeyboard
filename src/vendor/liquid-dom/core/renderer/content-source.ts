import type { Matrix2D } from '../matrix'
import type { Glass, Html } from '../scene'
import type { AdaptiveBlurTargetChain } from './gpu-targets'

/** Runtime texture and transform state for one scene-attached HTML node. */
export type SceneHtmlEntry = {
  html: Html
  texture: GPUTexture | null
  filteredTexture: GPUTexture | null
  elementVersion: number
  blur: number
  width: number
  height: number
  deviceWidth: number
  deviceHeight: number
  copiedDeviceWidth: number
  copiedDeviceHeight: number
  textureWidth: number
  textureHeight: number
  blurTargetChain: AdaptiveBlurTargetChain | null
  transform: Matrix2D
  inverseTransform: Matrix2D | null
}

/** Storage-buffer range for the HTML content entries attached to one glass. */
export type GlassContentRange = {
  start: number
  count: number
}

/** Optional content provider used by the WebGPU core for DOM-backed HTML layers. */
export type WebGpuGlassContentSource = {
  readonly atlasTexture?: GPUTexture | null
  readonly contentEntriesBindingResource?: GPUBindingResource | null
  getSceneHtmlEntry?: (html: Html) => SceneHtmlEntry | null
  getGlassContentRange?: (glass: Glass) => GlassContentRange | null
}
