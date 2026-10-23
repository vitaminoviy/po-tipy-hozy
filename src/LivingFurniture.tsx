import { useEffect, useMemo } from 'react'
import { buildLivingGeometry, type LivingKind } from './livingGeometry'
import { useSurface } from './visualMaterials'

export default function LivingFurniture({
  kind,
  floor,
}: {
  kind: LivingKind
  floor: number
}) {
  const linen = useSurface('linen'),
    oak = useSurface('oak')
  const batches = useMemo(() => buildLivingGeometry(kind, floor), [kind, floor])
  useEffect(
    () => () => batches.forEach(({ geometry }) => geometry.dispose()),
    [batches],
  )
  return (
    <group>
      {batches.map(({ c, surface, geometry }) => (
        <mesh
          key={`${surface}:${c}`}
          geometry={geometry}
          castShadow
          receiveShadow
        >
          <meshStandardMaterial
            color={c}
            map={
              surface === 'linen' ? (kind === 'sofa' ? undefined : linen) : oak
            }
            roughness={surface === 'linen' ? 0.96 : 0.72}
          />
        </mesh>
      ))}
    </group>
  )
}
