// Local box parts for the three upholstered models. Keep intentional interior
// intersections, but never overlap outward-facing coplanar faces of two parts.
export type BoxPart = {
  id: string
  p: [number, number, number]
  s: [number, number, number]
  c: string
}
export const upholsteredParts: Record<'sofa' | 'chair' | 'bed', BoxPart[]> = {
  sofa: [
    // Recess the base by 1–2 cm beneath the back and arms.
    { id: 'base', p: [0, 0.45, 0], s: [2.46, 0.55, 1.08], c: '#4e6955' },
    { id: 'back', p: [0, 0.95, -0.43], s: [2.5, 0.8, 0.24], c: '#6c8468' },
    // Arms end at the front of the back, rather than sharing its rear face.
    ...[-1.1, 1.1].map((x): BoxPart => ({
      id: `arm-${x}`,
      p: [x, 0.78, 0.12],
      s: [0.28, 0.5, 0.86],
      c: '#6c8468',
    })),
    ...[-0.53, 0.53].map((x): BoxPart => ({
      id: `seat-${x}`,
      p: [x, 0.78, 0.03],
      s: [0.97, 0.15, 0.79],
      c: '#8ca176',
    })),
    { id: 'pillow', p: [-0.7, 1, -0.2], s: [0.42, 0.42, 0.17], c: '#e1d2b3' },
  ],
  chair: [
    { id: 'base', p: [0, 0.48, 0], s: [0.98, 0.5, 0.98], c: '#b77c56' },
    { id: 'back', p: [0, 0.88, -0.38], s: [1, 0.65, 0.24], c: '#c58d65' },
    { id: 'seat', p: [0, 0.77, 0.06], s: [0.68, 0.15, 0.7], c: '#d2a17b' },
    ...[-0.43, 0.43].map((x): BoxPart => ({
      id: `arm-${x}`,
      p: [x, 0.78, 0.12],
      s: [0.14, 0.4, 0.76],
      c: '#c58d65',
    })),
  ],
  bed: [
    { id: 'base', p: [0, 0.3, 0], s: [2, 0.4, 2.65], c: '#a87546' },
    {
      id: 'headboard',
      p: [0, 0.94, -1.22],
      s: [2.08, 1.1, 0.16],
      c: '#ab8059',
    },
    { id: 'mattress', p: [0, 0.6, 0], s: [1.92, 0.3, 2.5], c: '#e9dec9' },
    // A 1 cm overhang separates the blanket's foot face from the mattress.
    { id: 'blanket', p: [0, 0.8, 0.35], s: [1.96, 0.16, 1.82], c: '#8b9c88' },
    ...[-0.48, 0.48].map((x): BoxPart => ({
      id: `pillow-${x}`,
      p: [x, 0.83, -0.86],
      s: [0.8, 0.18, 0.5],
      c: '#f3ead8',
    })),
    { id: 'fold', p: [0, 0.9, 0.96], s: [1.97, 0.04, 0.42], c: '#849483' },
  ],
}
