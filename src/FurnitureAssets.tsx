import { createContext, useContext, useEffect, useMemo, useState } from 'react'
import type { ReactNode } from 'react'
import { useThree } from '@react-three/fiber'
import { Matrix4 } from 'three'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { createMeshPicker } from './meshPicking'
import {
  disposeFurnitureSource,
  furnitureAssets,
  prepareFurnitureAsset,
} from './modelAssets'

type Loaded = ReturnType<typeof prepareFurnitureAsset>
const Assets = createContext<Loaded | null>(null)

export function FurnitureAssets({ children }: { children: ReactNode }) {
  const gl = useThree((state) => state.gl)
  const [loaded, setLoaded] = useState<Loaded | null>(null)
  useEffect(() => {
    let active = true
    let resource: Loaded | undefined
    gl.domElement.dataset.furnitureAssets = 'loading'
    new GLTFLoader().load(
      furnitureAssets.mintSofa.url,
      ({ scene }) => {
        if (!active) {
          disposeFurnitureSource(scene)
          return
        }
        try {
          resource = prepareFurnitureAsset(scene)
          setLoaded(resource)
          gl.domElement.dataset.furnitureAssets = 'ready'
        } catch (error) {
          disposeFurnitureSource(scene)
          gl.domElement.dataset.furnitureAssets = 'error'
          console.warn(
            'Sofa asset unavailable; using the procedural fallback',
            error,
          )
        }
      },
      undefined,
      (error) => {
        if (!active) return
        gl.domElement.dataset.furnitureAssets = 'error'
        console.warn(
          'Sofa asset unavailable; using the procedural fallback',
          error,
        )
      },
    )
    return () => {
      active = false
      resource?.dispose()
    }
  }, [gl])
  return <Assets.Provider value={loaded}>{children}</Assets.Provider>
}

export function SofaAsset({
  floor,
  fallback,
  children,
}: {
  floor: number
  fallback: ReactNode
  children?: ReactNode
}) {
  const loaded = useContext(Assets)
  const feet = useMemo(() => {
    const source = loaded?.batches.find((batch) => batch.feet)
    if (!source) return null
    const top = furnitureAssets.mintSofa.footTop
    // Feet touch floor/rug; seat anchors remain at .855 instead of moving up.
    const geometry = source.geometry
      .clone()
      .applyMatrix4(
        new Matrix4()
          .makeScale(1, (top - floor) / top, 1)
          .setPosition(0, floor, 0),
      )
    return { geometry, picker: createMeshPicker(geometry) }
  }, [loaded, floor])
  useEffect(
    () => () => {
      feet?.picker.dispose()
      feet?.geometry.dispose()
    },
    [feet],
  )
  if (!loaded) return fallback
  return (
    <>
      <group name={furnitureAssets.mintSofa.id} dispose={null}>
        {loaded.batches.map((batch, index) => (
          <mesh
            key={index}
            geometry={batch.feet ? feet!.geometry : batch.geometry}
            material={batch.material}
            raycast={batch.feet ? feet!.picker.raycast : batch.picker.raycast}
            castShadow
            receiveShadow
          />
        ))}
      </group>
      {children}
    </>
  )
}
