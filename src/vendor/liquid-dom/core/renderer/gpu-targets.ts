import { GPU_TEXTURE_USAGE } from './gpu-constants'

/** One resolution level in an adaptive blur chain. */
export type AdaptiveBlurTargetLevel = {
  ping: GPUTexture
  pong: GPUTexture
  width: number
  height: number
}

/** Full mip-like render target chain used by adaptive multi-resolution blur. */
export type AdaptiveBlurTargetChain = {
  format: GPUTextureFormat
  levels: AdaptiveBlurTargetLevel[]
}

/** Texture set used by blur passes and scene ping-pong composition. */
export type RenderTargetSet = {
  backdropBlur: AdaptiveBlurTargetChain
  displacementBlur: AdaptiveBlurTargetChain
  shadowBlur: AdaptiveBlurTargetChain
  sceneA: GPUTexture
  sceneB: GPUTexture
}

/** Rectangular texture copy in source and destination pixel coordinates. */
export type TextureCopyRegion = {
  sourceX: number
  sourceY: number
  destinationX: number
  destinationY: number
  width: number
  height: number
}

/** Creates a render target compatible with sampling, rendering, and copies. */
export function createRenderTarget(
  device: GPUDevice,
  format: GPUTextureFormat,
  width: number,
  height: number,
) {
  return device.createTexture({
    size: {
      width,
      height,
      depthOrArrayLayers: 1,
    },
    format,
    usage:
      GPU_TEXTURE_USAGE.COPY_SRC |
      GPU_TEXTURE_USAGE.TEXTURE_BINDING |
      GPU_TEXTURE_USAGE.RENDER_ATTACHMENT |
      GPU_TEXTURE_USAGE.COPY_DST,
  })
}

/** Creates a full-size-to-1px texture chain for adaptive blur. */
export function createAdaptiveBlurTargetChain(
  device: GPUDevice,
  format: GPUTextureFormat,
  width: number,
  height: number,
): AdaptiveBlurTargetChain {
  const levels: AdaptiveBlurTargetLevel[] = []
  let levelWidth = Math.max(Math.floor(width), 1)
  let levelHeight = Math.max(Math.floor(height), 1)

  while (true) {
    levels.push({
      ping: createRenderTarget(device, format, levelWidth, levelHeight),
      pong: createRenderTarget(device, format, levelWidth, levelHeight),
      width: levelWidth,
      height: levelHeight,
    })

    if (levelWidth === 1 && levelHeight === 1) {
      break
    }

    levelWidth = Math.max(Math.ceil(levelWidth / 2), 1)
    levelHeight = Math.max(Math.ceil(levelHeight / 2), 1)
  }

  return {
    format,
    levels,
  }
}

/** Destroys every texture in one adaptive blur chain. */
export function destroyAdaptiveBlurTargetChain(chain: AdaptiveBlurTargetChain | null | undefined) {
  if (!chain) {
    return
  }

  for (const level of chain.levels) {
    level.ping.destroy()
    level.pong.destroy()
  }
}

/** Destroys every texture in a render target set. */
export function destroyTargets(targets: RenderTargetSet | null) {
  if (!targets) {
    return
  }

  destroyAdaptiveBlurTargetChain(targets.backdropBlur)
  destroyAdaptiveBlurTargetChain(targets.displacementBlur)
  destroyAdaptiveBlurTargetChain(targets.shadowBlur)
  targets.sceneA.destroy()
  targets.sceneB.destroy()
}

/** Copies a positive-size rectangular region between two textures. */
export function copyTextureRegion(
  encoder: GPUCommandEncoder,
  source: GPUTexture,
  destination: GPUTexture,
  region: TextureCopyRegion,
) {
  const width = Math.floor(region.width)
  const height = Math.floor(region.height)

  if (width <= 0 || height <= 0) {
    return false
  }

  encoder.copyTextureToTexture(
    {
      texture: source,
      origin: {
        x: Math.floor(region.sourceX),
        y: Math.floor(region.sourceY),
        z: 0,
      },
    },
    {
      texture: destination,
      origin: {
        x: Math.floor(region.destinationX),
        y: Math.floor(region.destinationY),
        z: 0,
      },
    },
    {
      width,
      height,
      depthOrArrayLayers: 1,
    },
  )

  return true
}
