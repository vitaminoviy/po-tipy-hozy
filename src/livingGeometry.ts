import { CylinderGeometry, type BufferGeometry } from 'three'
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { partsOnSurface, type BoxPart } from './furnitureGeometry'

export type LivingKind = 'sofa' | 'chair' | 'table'
export type LivingPart = BoxPart & {
  radius: number
  surface: 'linen' | 'oak'
  tapered?: boolean
}

// Visual subdivisions stay inside the existing collision primitives. Seat/top
// anchors and persisted object poses continue to use the original geometry.
export function livingParts(kind: LivingKind, floor: number): LivingPart[] {
  const parts: LivingPart[] = []
  const add = (
    id: string,
    p: BoxPart['p'],
    s: BoxPart['s'],
    c: string,
    radius: number,
    surface: LivingPart['surface'] = 'linen',
  ) => parts.push({ id, p, s, c, radius, surface })
  if (kind === 'table') {
    add('top', [0, 0.55, 0], [1.35, 0.09, 0.85], '#bb916a', 0.043, 'oak')
    add('edge', [0, 0.488, 0], [1.25, 0.044, 0.75], '#98714f', 0.018, 'oak')
    for (const x of [-0.5, 0.5])
      for (const z of [-0.28, 0.28]) {
        add(
          `leg-${x}-${z}`,
          [x, 0.25, z],
          [0.09, 0.5, 0.09],
          '#98714f',
          0,
          'oak',
        )
        parts[parts.length - 1].tapered = true
      }
    return parts
  }
  const sofa = kind === 'sofa'
  const shell = sofa ? '#738671' : '#b5896d'
  const cushion = sofa ? '#94a18b' : '#c9a084'
  const welt = sofa ? '#83927b' : '#b68e72'
  for (const part of partsOnSurface(kind, floor)) {
    const { id, p, s } = part
    if (id === 'base') {
      const top = 0.62
      add(
        'plinth',
        [0, (floor + 0.14) / 2, 0],
        [s[0] - 0.14, 0.14 - floor, s[2] - 0.12],
        '#715b48',
        0.018,
        'oak',
      )
      add(
        'upholstered-base',
        [0, (0.14 + top) / 2, 0],
        [s[0] - 0.025, top - 0.14, s[2] - 0.025],
        shell,
        0.09,
      )
    } else if (id === 'back') {
      // A slim rear shell and independent pillowy front panels, all contained
      // in the old back volume (nothing protrudes onto the usable seat).
      add(
        'back-shell',
        [0, p[1], p[2] - 0.085],
        [s[0], s[1], 0.07],
        shell,
        0.03,
      )
      for (const x of sofa ? [-0.62, 0.62] : [0])
        add(
          `back-cushion-${x}`,
          [x, p[1] + 0.005, p[2] + 0.035],
          [sofa ? 1.2 : 0.94, s[1] - 0.035, 0.17],
          cushion,
          0.08,
        )
    } else if (id.startsWith('seat')) {
      // Thicken down into the existing base volume, never raise the anchor.
      const top = p[1] + s[1] / 2
      add(id, [p[0], top - 0.125, p[2]], [s[0], 0.25, s[2]], cushion, 0.1)
      // Recessed seam beneath the cushion: no coplanar duplicate shell.
      add(
        `${id}-welt`,
        [p[0], top - 0.215, p[2]],
        [s[0] - 0.012, 0.012, s[2] - 0.012],
        welt,
        0.005,
      )
    } else if (id.startsWith('arm')) {
      add(id, p, s, shell, sofa ? 0.13 : 0.065)
    } else {
      add(id, p, s, '#ddd0b5', 0.08)
    }
  }
  return parts
}

export function livingPartGeometry(part: LivingPart): BufferGeometry {
  let geometry: BufferGeometry
  if (part.tapered) {
    geometry = new CylinderGeometry(
      0.09 / Math.SQRT2,
      0.055 / Math.SQRT2,
      part.s[1],
      4,
    )
    geometry.rotateY(Math.PI / 4)
  } else {
    geometry = new RoundedBoxGeometry(
      ...part.s,
      3,
      Math.min(part.radius, Math.min(...part.s) * 0.49),
    )
  }
  geometry.translate(...part.p)
  if (!geometry.index) return geometry
  const flat = geometry.toNonIndexed()
  geometry.dispose()
  return flat
}

export function buildLivingGeometry(kind: LivingKind, floor: number) {
  const batches = new Map<
    string,
    { c: string; surface: LivingPart['surface']; parts: BufferGeometry[] }
  >()
  for (const part of livingParts(kind, floor)) {
    const key = `${part.surface}:${part.c}`
    if (!batches.has(key))
      batches.set(key, { c: part.c, surface: part.surface, parts: [] })
    batches.get(key)!.parts.push(livingPartGeometry(part))
  }
  return [...batches.values()].map(({ c, surface, parts }) => {
    const geometry = mergeGeometries(parts)!
    parts.forEach((part) => part.dispose())
    return { c, surface, geometry }
  })
}
