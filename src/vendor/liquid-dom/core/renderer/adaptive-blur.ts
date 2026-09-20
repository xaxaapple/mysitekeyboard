import {
  ADAPTIVE_BLUR_SHADER,
  DOWNSAMPLE_SHADER,
  UPSAMPLE_SHADER,
} from '../shaders'
import { GPU_BUFFER_USAGE } from './gpu-constants'
import {
  createPipelineBindGroup,
  drawFullscreenPass,
} from './gpu-pass'
import {
  GpuStructBuffer,
  type GpuStructDefinition,
} from './gpu-layout'
import type { AdaptiveBlurTargetChain } from './gpu-targets'
import { BlurParamsLayout } from './shader-layouts'

export const ADAPTIVE_BLUR_DENSE_RADIUS_PX = 6
const TRANSPARENT_BLACK = { r: 0, g: 0, b: 0, a: 0 } as const

type BlurParamsBuffer = GpuStructBuffer<GpuStructDefinition<typeof BlurParamsLayout>>

type AdaptiveBlurPipelines = {
  downsample: GPURenderPipeline
  blur: GPURenderPipeline
  upsample: GPURenderPipeline
}

export type AdaptiveBlurResources = {
  pipelines: AdaptiveBlurPipelines
  horizontalBuffer: BlurParamsBuffer
  verticalBuffer: BlurParamsBuffer
}

type AdaptiveBlurRenderOptions = {
  device: GPUDevice
  sampler: GPUSampler
  encoder: GPUCommandEncoder
  source: GPUTexture
  radiusPx: number
  chain: AdaptiveBlurTargetChain
  resources: AdaptiveBlurResources
}

export type AdaptiveBlurLevelSelection = {
  skip: boolean
  level: number
  scale: number
  effectiveRadius: number
}

/** Chooses the lowest-resolution blur level that keeps the kernel densely sampled. */
export function chooseAdaptiveBlurLevel(radiusPx: number, maxLevel: number): AdaptiveBlurLevelSelection {
  const normalizedMaxLevel = Number.isFinite(maxLevel) ? Math.max(0, Math.floor(maxLevel)) : 0
  const normalizedRadius = Number.isFinite(radiusPx) ? Math.max(radiusPx, 0) : 0

  if (normalizedRadius <= 0) {
    return {
      skip: true,
      level: 0,
      scale: 1,
      effectiveRadius: 0,
    }
  }

  const requestedLevel = Math.ceil(Math.log2(normalizedRadius / ADAPTIVE_BLUR_DENSE_RADIUS_PX))
  const level = Math.min(Math.max(requestedLevel, 0), normalizedMaxLevel)
  const scale = 2 ** level

  return {
    skip: false,
    level,
    scale,
    effectiveRadius: normalizedRadius / scale,
  }
}

/** Creates pipelines and uniforms for adaptive blur over one texture format. */
export function createAdaptiveBlurResources(device: GPUDevice, format: GPUTextureFormat): AdaptiveBlurResources {
  const downsampleModule = device.createShaderModule({ code: DOWNSAMPLE_SHADER })
  const blurModule = device.createShaderModule({ code: ADAPTIVE_BLUR_SHADER })
  const upsampleModule = device.createShaderModule({ code: UPSAMPLE_SHADER })
  const uniformBufferUsage = GPU_BUFFER_USAGE.UNIFORM | GPU_BUFFER_USAGE.COPY_DST

  return {
    pipelines: {
      downsample: createFullscreenPipeline(device, format, downsampleModule),
      blur: createFullscreenPipeline(device, format, blurModule),
      upsample: createFullscreenPipeline(device, format, upsampleModule),
    },
    horizontalBuffer: new GpuStructBuffer(device, BlurParamsLayout, uniformBufferUsage),
    verticalBuffer: new GpuStructBuffer(device, BlurParamsLayout, uniformBufferUsage),
  }
}

/** Destroys GPU buffers owned by one adaptive blur resource set. */
export function destroyAdaptiveBlurResources(resources: AdaptiveBlurResources | null | undefined) {
  resources?.horizontalBuffer.destroy()
  resources?.verticalBuffer.destroy()
}

/** Runs the shared multi-resolution blur and returns the texture containing the result. */
export function renderAdaptiveBlur({
  device,
  sampler,
  encoder,
  source,
  radiusPx,
  chain,
  resources,
}: AdaptiveBlurRenderOptions) {
  if (chain.levels.length === 0) {
    return source
  }

  const selection = chooseAdaptiveBlurLevel(radiusPx, chain.levels.length - 1)
  if (selection.skip) {
    return source
  }

  // Move to the coarsest selected level first so the fixed blur kernel stays
  // dense relative to the effective radius, even for large CSS blur values.
  let current = source
  for (let levelIndex = 1; levelIndex <= selection.level; levelIndex += 1) {
    const targetLevel = chain.levels[levelIndex]
    const bindGroup = createPipelineBindGroup(device, resources.pipelines.downsample, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: current.createView() },
    ])
    drawFullscreenPass(encoder, {
      pipeline: resources.pipelines.downsample,
      bindGroup,
      target: targetLevel.ping,
      clearValue: TRANSPARENT_BLACK,
    })
    current = targetLevel.ping
  }

  const blurLevel = chain.levels[selection.level]
  writeAdaptiveBlurParams(selection.effectiveRadius, resources.horizontalBuffer, resources.verticalBuffer)

  const horizontalBindGroup = createPipelineBindGroup(device, resources.pipelines.blur, [
    { binding: 0, resource: sampler },
    { binding: 1, resource: current.createView() },
    { binding: 2, resource: resources.horizontalBuffer.bindingResource },
  ])
  drawFullscreenPass(encoder, {
    pipeline: resources.pipelines.blur,
    bindGroup: horizontalBindGroup,
    target: blurLevel.pong,
    clearValue: TRANSPARENT_BLACK,
  })

  const verticalBindGroup = createPipelineBindGroup(device, resources.pipelines.blur, [
    { binding: 0, resource: sampler },
    { binding: 1, resource: blurLevel.pong.createView() },
    { binding: 2, resource: resources.verticalBuffer.bindingResource },
  ])
  drawFullscreenPass(encoder, {
    pipeline: resources.pipelines.blur,
    bindGroup: verticalBindGroup,
    target: blurLevel.ping,
    clearValue: TRANSPARENT_BLACK,
  })

  // Come back to full resolution one level at a time. Progressive linear
  // upsampling avoids a single large stretch and keeps premultiplied fields valid.
  current = blurLevel.ping
  for (let levelIndex = selection.level - 1; levelIndex >= 0; levelIndex -= 1) {
    const targetLevel = chain.levels[levelIndex]
    const bindGroup = createPipelineBindGroup(device, resources.pipelines.upsample, [
      { binding: 0, resource: sampler },
      { binding: 1, resource: current.createView() },
    ])
    drawFullscreenPass(encoder, {
      pipeline: resources.pipelines.upsample,
      bindGroup,
      target: targetLevel.pong,
      clearValue: TRANSPARENT_BLACK,
    })
    current = targetLevel.pong
  }

  return current
}

function createFullscreenPipeline(
  device: GPUDevice,
  format: GPUTextureFormat,
  module: GPUShaderModule,
) {
  return device.createRenderPipeline({
    layout: 'auto',
    vertex: {
      module,
      entryPoint: 'vertexMain',
    },
    fragment: {
      module,
      entryPoint: 'fragmentMain',
      targets: [{ format }],
    },
    primitive: {
      topology: 'triangle-list',
    },
  })
}

function writeAdaptiveBlurParams(
  radiusPx: number,
  horizontalBuffer: BlurParamsBuffer,
  verticalBuffer: BlurParamsBuffer,
) {
  const blurRadius = Math.max(radiusPx, 0)
  horizontalBuffer.write({
    params: {
      directionX: 1,
      directionY: 0,
      radius: blurRadius,
    },
  })
  verticalBuffer.write({
    params: {
      directionX: 0,
      directionY: 1,
      radius: blurRadius,
    },
  })
}
