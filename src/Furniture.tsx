import type { ThreeEvent } from '@react-three/fiber'
import type { Item } from './placement'
import { catalog, footprint } from './placement'

export function Box({
  p,
  s,
  c,
  ...rest
}: {
  p: [number, number, number]
  s: [number, number, number]
  c: string
  castShadow?: boolean
}) {
  return (
    <mesh position={p} castShadow receiveShadow {...rest}>
      <boxGeometry args={s} />
      <meshStandardMaterial color={c} roughness={0.85} />
    </mesh>
  )
}
function Leg({ x, z, h = 0.4 }: { x: number; z: number; h?: number }) {
  return <Box p={[x, h / 2, z]} s={[0.09, h, 0.09]} c="#73583d" />
}
function Model({ kind }: { kind: Item['kind'] }) {
  const wood = '#b58a60',
    cream = '#e9dec9'
  switch (kind) {
    case 'sofa':
      return (
        <>
          <Box p={[0, 0.45, 0]} s={[2.5, 0.55, 1.1]} c="#6e826f" />
          <Box p={[0, 0.95, -0.43]} s={[2.5, 0.8, 0.24]} c="#7d907a" />
          {[-1.1, 1.1].map((x) => (
            <Box key={x} p={[x, 0.78, 0]} s={[0.28, 0.5, 1.1]} c="#7d907a" />
          ))}
          {[-0.53, 0.53].map((x) => (
            <Box
              key={x}
              p={[x, 0.78, 0.03]}
              s={[0.97, 0.15, 0.79]}
              c="#9aaa8c"
            />
          ))}
          <Box p={[-0.7, 1, -0.2]} s={[0.42, 0.42, 0.17]} c="#e1d2b3" />
        </>
      )
    case 'table':
      return (
        <>
          <Box p={[0, 0.53, 0]} s={[1.35, 0.13, 0.85]} c={wood} />
          {[-0.5, 0.5].flatMap((x) =>
            [-0.28, 0.28].map((z) => (
              <Leg key={`${x}${z}`} x={x} z={z} h={0.5} />
            )),
          )}
          <Box p={[-0.25, 0.63, 0]} s={[0.35, 0.07, 0.26]} c="#6c7c72" />
          <mesh position={[0.3, 0.67, 0.06]}>
            <cylinderGeometry args={[0.1, 0.1, 0.16, 20]} />
            <meshStandardMaterial color={cream} />
          </mesh>
        </>
      )
    case 'chair':
      return (
        <>
          <Box p={[0, 0.48, 0]} s={[1, 0.5, 1]} c="#b77c56" />
          <Box p={[0, 0.88, -0.38]} s={[1, 0.65, 0.24]} c="#c58d65" />
          <Box p={[0, 0.77, 0.06]} s={[0.68, 0.15, 0.7]} c="#d2a17b" />
          {[-0.43, 0.43].map((x) => (
            <Box key={x} p={[x, 0.78, 0]} s={[0.14, 0.4, 1]} c="#c58d65" />
          ))}
        </>
      )
    case 'bed':
      return (
        <>
          <Box p={[0, 0.3, 0]} s={[2, 0.4, 2.65]} c={wood} />
          <Box p={[0, 0.94, -1.22]} s={[2.08, 1.1, 0.16]} c="#ab8059" />
          <Box p={[0, 0.6, 0]} s={[1.92, 0.3, 2.5]} c={cream} />
          <Box p={[0, 0.8, 0.35]} s={[1.96, 0.16, 1.8]} c="#b4b8a3" />
          {[-0.48, 0.48].map((x) => (
            <Box
              key={x}
              p={[x, 0.83, -0.86]}
              s={[0.8, 0.18, 0.5]}
              c="#f3ead8"
            />
          ))}
          <Box p={[0, 0.9, 0.96]} s={[1.97, 0.04, 0.42]} c="#849483" />
        </>
      )
    case 'cabinet':
      return (
        <>
          <Box p={[0, 0.65, 0]} s={[1.5, 1.1, 0.65]} c={wood} />
          <Box p={[0, 1.24, 0]} s={[1.58, 0.09, 0.72]} c="#caa47b" />
          {[0.35, 0.7, 1.05].map((y) => (
            <group key={y}>
              <Box p={[0, y, 0.335]} s={[1.38, 0.29, 0.03]} c="#bc936a" />
              <Box p={[0, y, 0.37]} s={[0.22, 0.035, 0.04]} c="#70553a" />
            </group>
          ))}
        </>
      )
    case 'plant':
      return (
        <>
          <mesh position={[0, 0.24, 0]} castShadow>
            <cylinderGeometry args={[0.27, 0.19, 0.48, 24]} />
            <meshStandardMaterial color="#c38f70" />
          </mesh>
          <Box p={[0, 0.7, 0]} s={[0.04, 0.75, 0.04]} c="#526f4d" />
          {Array.from({ length: 7 }, (_, i) => (
            <mesh
              key={i}
              position={[
                Math.sin(i * 2.4) * 0.18,
                0.63 + i * 0.09,
                Math.cos(i * 2.4) * 0.17,
              ]}
              rotation={[i * 0.3, 0, i * 0.5]}
              castShadow
            >
              <sphereGeometry args={[0.23, 12, 8]} />
              <meshStandardMaterial color={i % 2 ? '#6b885c' : '#7d9c6c'} />
            </mesh>
          ))}
        </>
      )
    case 'lamp':
      return (
        <>
          <mesh position={[0, 0.05, 0]} castShadow>
            <cylinderGeometry args={[0.3, 0.3, 0.1, 24]} />
            <meshStandardMaterial color="#6e6958" />
          </mesh>
          <Box p={[0, 0.8, 0]} s={[0.035, 1.5, 0.035]} c="#8c7c5f" />
          <mesh position={[0, 1.55, 0]} castShadow>
            <cylinderGeometry args={[0.22, 0.32, 0.4, 24]} />
            <meshStandardMaterial
              color="#efdfb9"
              emissive="#dcb26c"
              emissiveIntensity={0.2}
            />
          </mesh>
        </>
      )
  }
}
export default function Furniture({
  item,
  selected,
  invalid,
  onDown,
}: {
  item: Item
  selected: boolean
  invalid: boolean
  onDown: (e: ThreeEvent<PointerEvent>, item: Item) => void
}) {
  const [w, d] = footprint(item)
  return (
    <group position={[item.x, 0, item.z]}>
      {selected && (
        <mesh position={[0, 0.018, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <planeGeometry args={[w + 0.14, d + 0.14]} />
          <meshBasicMaterial
            color={invalid ? '#d5654e' : '#73966f'}
            transparent
            opacity={0.45}
            depthWrite={false}
          />
        </mesh>
      )}
      <group
        rotation={[0, (item.rotation * Math.PI) / 2, 0]}
        onPointerDown={(e) => onDown(e, item)}
        onPointerOver={(e) => {
          e.stopPropagation()
          document.body.style.cursor = 'grab'
        }}
        onPointerOut={() => {
          document.body.style.cursor = 'auto'
        }}
      >
        <Model kind={item.kind} />
      </group>
      {selected && (
        <mesh position={[0, 0.025, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <ringGeometry
            args={[Math.max(w, d) * 0.55, Math.max(w, d) * 0.55 + 0.015, 64]}
          />
          <meshBasicMaterial
            color={invalid ? '#d5654e' : '#496d50'}
            transparent
            opacity={0.6}
          />
        </mesh>
      )}
    </group>
  )
}
