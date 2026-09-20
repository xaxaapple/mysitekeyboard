# Vendored: Liquid DOM core

`core/` is a copy of `packages/core/src` from https://github.com/AndrewPrifer/liquid-dom
(`@liquid-dom/core` 0.1.1, MIT - see `LICENSE`), used unmodified except for:

- `core/layout.ts` (the `@liquid-dom/core/layout` subpath) is not included; nothing here uses it.
- Six constructors that used TypeScript *parameter properties*
  (`renderer/pointer-controller.ts`, `renderer/dom-content-sync.ts`, `renderer/gpu-layout.ts`,
  `renderer/backdrop-metrics-state.ts`, `renderer/gpu-pass.ts`) were rewritten as plain
  fields + assignments, because this project compiles with `erasableSyntaxOnly`.
  Behaviour is identical.

Types for `GPU*` come from `@webgpu/types` (dev dependency).
