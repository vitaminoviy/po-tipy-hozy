import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group, IcosahedronGeometry } from 'three'
import { floorSupport } from './grounding'
import type { Item } from './placement'
import {
  bins,
  trashTypes,
  disposalFrame,
  DISPOSAL_MS,
  type Trash,
  type Disposal,
} from './cleaning'

const paperGeometry = new IcosahedronGeometry(0.12, 0)
paperGeometry.computeBoundingBox()
const paperY = -paperGeometry.boundingBox!.min.y
function TrashModel({ kind }: { kind: Trash['kind'] }) {
  if (kind === 'paper')
    return (
      <mesh
        geometry={paperGeometry}
        position={[0, paperY, 0]}
        castShadow
        receiveShadow
      >
        <meshStandardMaterial color="#e9dec9" flatShading />
      </mesh>
    )
  if (kind === 'can')
    return (
      <group>
        <mesh position={[0, 0.11, 0]} castShadow receiveShadow>
          <cylinderGeometry args={[0.08, 0.08, 0.22, 12]} />
          <meshStandardMaterial
            color="#929b91"
            roughness={0.7}
            metalness={0.35}
          />
        </mesh>
        <mesh position={[0, 0.221, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.038, 12]} />
          <meshStandardMaterial color="#4e6955" />
        </mesh>
      </group>
    )
  if (kind === 'wrapper')
    return (
      <group>
        <mesh position={[0, 0.0075, 0]} castShadow receiveShadow>
          <boxGeometry args={[0.26, 0.015, 0.18]} />
          <meshStandardMaterial color="#e1d2b3" />
        </mesh>
        <mesh position={[0, 0.02, 0]} castShadow>
          <boxGeometry args={[0.035, 0.01, 0.17]} />
          <meshStandardMaterial color="#c0956c" />
        </mesh>
      </group>
    )
  return (
    <group>
      <mesh position={[0, 0.01, 0]} castShadow receiveShadow>
        <boxGeometry args={[0.32, 0.02, 0.26]} />
        <meshStandardMaterial color="#ae8056" />
      </mesh>
      {[-1, 1].map((sign) => (
        <group key={sign}>
          <mesh position={[sign * 0.151, 0.09, 0]} castShadow receiveShadow>
            <boxGeometry args={[0.018, 0.14, 0.26]} />
            <meshStandardMaterial color="#c0956c" />
          </mesh>
          <mesh position={[0, 0.09, sign * 0.121]} castShadow receiveShadow>
            <boxGeometry args={[0.284, 0.14, 0.018]} />
            <meshStandardMaterial color="#c0956c" />
          </mesh>
        </group>
      ))}
    </group>
  )
}
function TrashObject({
  trash,
  items,
  pending,
  enabled,
  onPick,
  onHint,
}: {
  trash: Trash
  items: Item[]
  pending: Disposal | null
  enabled: boolean
  onPick: (id: string) => void
  onHint: (text: string) => void
}) {
  const [hover, setHover] = useState(false)
  const root = useRef<Group>(null)
  const [w, , d] = trashTypes[trash.kind].size
  const y = floorSupport({ x: trash.x, z: trash.z, w, d }, items)
  const animated = pending?.id === trash.id
  useFrame(() => {
    if (!root.current) return
    const bin = bins.find((b) => b.id === pending?.binId)
    const pose = disposalFrame(
      trash,
      bin ?? trash,
      animated ? (performance.now() - pending.startedAt) / DISPOSAL_MS : 0,
    )
    root.current.position.set(pose.x, y + pose.lift, pose.z)
    root.current.scale.setScalar(pose.scale)
  })
  if (trash.state === 'disposed') return null
  return (
    <group
      ref={root}
      position={[trash.x, y, trash.z]}
      onPointerDown={(e) => {
        if (e.button !== 0 || e.buttons !== 1) return
        e.stopPropagation()
        if (animated) return
        if (enabled) onPick(trash.id)
        else
          onHint(
            pending
              ? 'Подождите завершения уборки; Esc — отменить'
              : 'Для уборки включите «Взаимодействие» — Tab',
          )
      }}
    >
      <TrashModel kind={trash.kind} />
      {!animated && (hover || trash.state === 'selected') && (
        <mesh
          position={[0, 0.003, 0]}
          rotation={[-Math.PI / 2, 0, 0]}
          raycast={() => null}
        >
          <ringGeometry args={[0.21, 0.235, 32]} />
          <meshBasicMaterial color="#60765d" depthWrite={false} />
        </mesh>
      )}
      {!animated && enabled && (
        <mesh
          position={[0, 0.14, 0]}
          userData={{ cleaningTarget: 'trash', id: trash.id }}
          onPointerOver={(e) => {
            if (e.buttons === 0) {
              e.stopPropagation()
              setHover(true)
            }
          }}
          onPointerOut={() => setHover(false)}
        >
          <boxGeometry args={[0.5, 0.28, 0.5]} />
          <meshBasicMaterial
            transparent
            opacity={0}
            depthWrite={false}
            colorWrite={false}
          />
        </mesh>
      )}
    </group>
  )
}
function BinObject({
  bin,
  items,
  pending,
  feedback,
  onBin,
}: {
  bin: (typeof bins)[number]
  items: Item[]
  pending: Disposal | null
  feedback: { id: string; at: number } | null
  onBin: (id: string) => void
}) {
  const [hover, setHover] = useState(false)
  const root = useRef<Group>(null)
  const y = floorSupport({ ...bin, w: 0.46, d: 0.46 }, items)
  useFrame(() => {
    if (!root.current) return
    const t =
      feedback?.id === bin.id
        ? Math.min(1, (performance.now() - feedback.at) / 280)
        : 1
    root.current.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.06)
  })
  return (
    <group ref={root} position={[bin.x, y, bin.z]}>
      <mesh position={[0, 0.225, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.22, 0.18, 0.45, 16, 1, true]} />
        <meshStandardMaterial color="#89937f" side={2} />
      </mesh>
      <mesh position={[0, 0.012, 0]} castShadow receiveShadow>
        <cylinderGeometry args={[0.18, 0.18, 0.024, 16]} />
        <meshStandardMaterial color="#4e6955" />
      </mesh>
      <mesh position={[0, 0.45, 0]} rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[0.22, 0.016, 6, 24]} />
        <meshStandardMaterial
          color={hover || pending?.binId === bin.id ? '#60765d' : '#c0956c'}
        />
      </mesh>
      <mesh
        position={[0, 0.25, 0]}
        userData={{ cleaningTarget: 'bin', id: bin.id }}
        onPointerOver={(e) => {
          if (!e.buttons) {
            e.stopPropagation()
            setHover(true)
          }
        }}
        onPointerOut={() => setHover(false)}
        onPointerDown={(e) => {
          if (e.button === 0 && e.buttons === 1) {
            e.stopPropagation()
            onBin(bin.id)
          }
        }}
      >
        <cylinderGeometry args={[0.28, 0.28, 0.5, 16]} />
        <meshBasicMaterial
          transparent
          opacity={0}
          depthWrite={false}
          colorWrite={false}
        />
      </mesh>
    </group>
  )
}
export default function Cleaning({
  trash,
  items,
  pending,
  enabled,
  feedback,
  onPick,
  onBin,
  onHint,
}: {
  trash: Trash[]
  items: Item[]
  pending: Disposal | null
  enabled: boolean
  feedback: { id: string; at: number } | null
  onPick: (id: string) => void
  onBin: (id: string) => void
  onHint: (text: string) => void
}) {
  return (
    <group name="cleaning">
      {trash.map((t) => (
        <TrashObject
          key={t.id}
          trash={t}
          items={items}
          pending={pending}
          enabled={enabled && !pending}
          onPick={onPick}
          onHint={onHint}
        />
      ))}
      {bins.map((bin) => (
        <BinObject
          key={bin.id}
          bin={bin}
          items={items}
          pending={pending}
          feedback={feedback}
          onBin={onBin}
        />
      ))}
    </group>
  )
}
