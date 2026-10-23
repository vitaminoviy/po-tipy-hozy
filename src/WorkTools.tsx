import { useState } from 'react'
import type { ThreeEvent } from '@react-three/fiber'
import { Box } from './Furniture'
import { paintColors, type PaintColor } from './painting'
import { floorMaterials, type FloorMaterial } from './flooring'
export type WorkTool = 'roller' | 'sponge' | FloorMaterial | null
import {
  workArea,
  toolPositions,
  floorSampleArea,
  floorSamplePositions,
} from './workArea'
export { toolPositions } from './workArea'
export default function WorkTools({
  tool,
  color,
  onTool,
  onColor,
  onHint,
}: {
  tool: WorkTool
  color: PaintColor
  onTool: (t: WorkTool) => void
  onColor: (c: PaintColor) => void
  onHint: (s: string) => void
}) {
  const [hover, setHover] = useState<string | null>(null)
  const events = (id: string, label: string, action: () => void) => ({
    onPointerOver: (e: ThreeEvent<PointerEvent>) => {
      e.stopPropagation()
      setHover(id)
      document.body.style.cursor = 'pointer'
      onHint(label)
    },
    onPointerOut: () => {
      setHover(null)
      document.body.style.cursor = 'auto'
    },
    onPointerDown: (e: ThreeEvent<PointerEvent>) => {
      if (e.button !== 0) return
      e.stopPropagation()
      action()
    },
  })
  return (
    <group>
      <Box
        p={[...workArea.position]}
        s={[...workArea.size]}
        c="#c6bea8"
        radius={0.025}
        surface="wood"
      />
      {(['roller', 'sponge'] as const).map((id) => (
        <group
          key={id}
          position={[...toolPositions[id]]}
          userData={{ workTool: id }}
          {...events(
            id,
            id === 'roller'
              ? 'Валик — покраска стен'
              : 'Губка — протирание пола',
            () => onTool(tool === id ? null : id),
          )}
        >
          <Box
            p={[0, -0.03, 0]}
            s={[0.85, 0.08, 0.78]}
            c={tool === id ? '#9bad8f' : hover === id ? '#e9dec9' : '#c6bea8'}
          />
          {id === 'roller' ? (
            <group>
              <mesh position={[0, 0.13, 0]} rotation={[0, 0, Math.PI / 2]}>
                <cylinderGeometry args={[0.12, 0.12, 0.65, 16]} />
                <meshStandardMaterial color={paintColors[color].hex} />
              </mesh>
              <Box p={[0.3, 0.09, 0.18]} s={[0.035, 0.035, 0.35]} c="#a8a89b" />
              <Box
                p={[0.3, 0.09, 0.37]}
                s={[0.11, 0.1, 0.25]}
                c="#b89468"
                radius={0.025}
                surface="wood"
              />
            </group>
          ) : (
            <Box
              p={[0, 0.08, 0]}
              s={[0.55, 0.16, 0.38]}
              c="#d5c99a"
              radius={0.045}
              surface="fabric"
            />
          )}
          <mesh position={[0, 0.1, 0]}>
            <boxGeometry args={[0.9, 0.45, 0.8]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {(Object.keys(paintColors) as PaintColor[]).map((id) => (
        <group
          key={id}
          position={[...toolPositions[id]]}
          userData={{ paintSample: id }}
          {...events(id, paintColors[id].name, () => onColor(id))}
        >
          <mesh>
            <cylinderGeometry args={[0.24, 0.22, 0.36, 20]} />
            <meshStandardMaterial
              color="#c1c0b7"
              metalness={0.45}
              roughness={0.38}
            />
          </mesh>
          <mesh position={[0, 0.19, 0]}>
            <cylinderGeometry args={[0.225, 0.225, 0.035, 20]} />
            <meshStandardMaterial color={paintColors[id].hex} />
          </mesh>
          <mesh position={[0, -0.16, 0]}>
            <cylinderGeometry args={[0.31, 0.31, 0.03, 24]} />
            <meshStandardMaterial
              color={
                color === id ? '#66795d' : hover === id ? '#e9dec9' : '#c6bea8'
              }
            />
          </mesh>
        </group>
      ))}
      <Box
        p={[...floorSampleArea.position]}
        s={[...floorSampleArea.size]}
        c="#c6bea8"
        radius={0.025}
        surface="wood"
      />
      {(Object.keys(floorMaterials) as FloorMaterial[]).map((id) => (
        <group
          key={id}
          position={[...floorSamplePositions[id]]}
          userData={{ floorSample: id }}
          {...events(id, floorMaterials[id].name, () =>
            onTool(tool === id ? null : id),
          )}
        >
          <Box
            p={[0, -0.03, 0]}
            s={[0.8, 0.08, 0.4]}
            c={tool === id ? '#66795d' : hover === id ? '#e9dec9' : '#b4b09b'}
          />
          {Array.from({ length: id === 'tile' ? 4 : 3 }, (_, i) =>
            id === 'tile' ? (
              <Box
                key={i}
                p={[
                  ((i % 2) - 0.5) * 0.34,
                  0.025,
                  (Math.floor(i / 2) - 0.5) * 0.15,
                ]}
                s={[0.325, 0.025, 0.14]}
                c={floorMaterials[id].colors[i % 3]}
                radius={0.004}
                surface="plain"
              />
            ) : (
              <Box
                key={i}
                p={[0, 0.025, (i - 1) * 0.1]}
                s={[0.7, 0.025, 0.09]}
                c={floorMaterials[id].colors[i % 3]}
                radius={0.004}
                surface="wood"
              />
            ),
          )}
          <mesh position={[0, 0.05, 0]}>
            <boxGeometry args={[0.9, 0.25, 0.48]} />
            <meshBasicMaterial transparent opacity={0} depthWrite={false} />
          </mesh>
        </group>
      ))}
      {/* Reserved empty place for a future tool; no inactive picking target. */}
      <Box p={[-4.18, -0.1975, 4.55]} s={[0.3, 0.025, 0.65]} c="#b4b09b" />
    </group>
  )
}
