// Extents include the roller handle and the paint-can feet, not only centers.
export const workArea = {
  position: [-1.65, -0.35, 4.6] as const,
  size: [5.8, 0.28, 1.3] as const,
  safeInset: 0.2,
}
export const toolPositions = {
  roller: [-3.6, -0.14, 4.55],
  sponge: [-2.4, -0.14, 4.55],
  cream: [-1.15, -0.035, 4.7],
  sage: [-0.25, -0.035, 4.7],
  terracotta: [0.65, -0.035, 4.7],
} as const
export const toolFootprints = {
  roller: { left: 0.425, right: 0.425, back: 0.39, front: 0.495 },
  sponge: { left: 0.425, right: 0.425, back: 0.39, front: 0.39 },
  cream: { left: 0.31, right: 0.31, back: 0.31, front: 0.31 },
  sage: { left: 0.31, right: 0.31, back: 0.31, front: 0.31 },
  terracotta: { left: 0.31, right: 0.31, back: 0.31, front: 0.31 },
} as const
