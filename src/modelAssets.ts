import { BufferGeometry, Material, Mesh, Object3D, Texture } from 'three'
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js'
import { createMeshPicker } from './meshPicking'

// Visual identity is separate from persisted Item.id/kind and collision bounds.
export const furnitureAssets = {
  mintSofa: {
    id: 'mint-sofa-v1',
    url: `${import.meta.env?.BASE_URL ?? '/'}models/sofa/mint-sofa-v1.glb`,
    seatHeight: 0.855,
    footTop: 0.25,
  },
} as const

export type FurnitureBatch = {
  geometry: BufferGeometry
  material: Material
  feet: boolean
  picker: ReturnType<typeof createMeshPicker>
}

function resources(scene: Object3D) {
  const geometries = new Set<BufferGeometry>()
  const materials = new Set<Material>()
  const textures = new Set<Texture>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    geometries.add(object.geometry)
    for (const material of [object.material].flat()) {
      materials.add(material)
      for (const value of Object.values(material))
        if (value instanceof Texture) textures.add(value)
    }
  })
  return { geometries, materials, textures }
}

export function disposeFurnitureSource(scene: Object3D) {
  const { geometries, materials, textures } = resources(scene)
  geometries.forEach((geometry) => geometry.dispose())
  materials.forEach((material) => material.dispose())
  textures.forEach((texture) => {
    texture.dispose()
    const image = texture.source.data
    if (typeof image?.close === 'function') image.close()
  })
}

// Each Canvas owns this resource set. Never retain disposed renderer resources
// in a global useGLTF cache when starting a new game/remounting the Canvas.
export function prepareFurnitureAsset(scene: Object3D) {
  scene.updateMatrixWorld(true)
  const groups = new Map<Material, { feet: boolean; parts: BufferGeometry[] }>()
  scene.traverse((object) => {
    if (!(object instanceof Mesh)) return
    if (Array.isArray(object.material))
      throw new Error('Furniture asset requires one material per mesh')
    const group = groups.get(object.material) ?? {
      feet:
        object.name.startsWith('Ash_foot') ||
        object.name.startsWith('Ash foot'),
      parts: [],
    }
    group.parts.push(object.geometry.clone().applyMatrix4(object.matrixWorld))
    groups.set(object.material, group)
  })
  const batches: FurnitureBatch[] = []
  try {
    for (const [material, { feet, parts }] of groups) {
      const geometry = mergeGeometries(parts)
      if (!geometry) throw new Error('Incompatible furniture geometry')
      batches.push({
        material,
        geometry,
        feet,
        picker: createMeshPicker(geometry),
      })
    }
  } catch (error) {
    batches.forEach(({ geometry, picker }) => {
      picker.dispose()
      geometry.dispose()
    })
    throw error
  } finally {
    groups.forEach(({ parts }) => parts.forEach((part) => part.dispose()))
  }
  if (batches.length !== 2 || !batches.some((batch) => batch.feet)) {
    batches.forEach(({ geometry, picker }) => {
      picker.dispose()
      geometry.dispose()
    })
    throw new Error('Unexpected sofa materials or feet')
  }
  return {
    batches,
    dispose() {
      batches.forEach(({ geometry, picker }) => {
        picker.dispose()
        geometry.dispose()
      })
      disposeFurnitureSource(scene)
    },
  }
}
