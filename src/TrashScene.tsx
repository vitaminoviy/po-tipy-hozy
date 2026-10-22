import { useEffect, useMemo, useRef, useState } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Group, IcosahedronGeometry } from 'three'
import { floorSupport } from './grounding'
import type { Item } from './placement'
import {
  trashTypes,
  disposalFrame,
  DISPOSAL_MS,
  type Trash,
  type Disposal,
} from './cleaning'

function TrashModel({
  kind,
  paperGeometry,
}: {
  kind: Trash['kind']
  paperGeometry: IcosahedronGeometry
}) {
  if (kind === 'paper')
    return (
      <mesh
        geometry={paperGeometry}
        position={[0, -paperGeometry.boundingBox!.min.y, 0]}
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
  paperGeometry,
  items,
  pending,
  enabled,
  onPick,
  onQuick,
  onComplete,
  quickEnabled,
  onHint,
}: {
  trash: Trash
  paperGeometry: IcosahedronGeometry
  items: Item[]
  pending: Disposal | null
  enabled: boolean
  onPick: (id: string) => void
  onQuick: (id: string) => void
  onComplete: (pending: Disposal) => void
  quickEnabled: boolean
  onHint: (text: string) => void
}) {
  const [hover, setHover] = useState(false)
  const root = useRef<Group>(null)
  const [w, , d] = trashTypes[trash.kind].size
  const y = floorSupport({ x: trash.x, z: trash.z, w, d }, items)
  const animated = pending?.id === trash.id
  const { gl } = useThree()
  const flight = useRef<{
    pending: Disposal
    elapsed: number
    endpointDrawn: boolean
    notified: boolean
  } | null>(null)
  useFrame((_, delta) => {
    if (!root.current) return
    if (!animated) {
      root.current.position.set(trash.x, y, trash.z)
      root.current.scale.setScalar(1)
      flight.current = null
      return
    }
    if (flight.current?.pending !== pending)
      flight.current = {
        pending,
        elapsed: 0,
        endpointDrawn: false,
        notified: false,
      }
    else flight.current.elapsed += Math.min(delta, 0.05)
    const active = flight.current,
      t = Math.min(1, (active.elapsed * 1000) / DISPOSAL_MS)
    const pose = disposalFrame(pending.from, pending.to, t)
    root.current.position.set(pose.x, pose.y, pose.z)
    root.current.scale.setScalar(pose.scale)
    gl.domElement.dataset.flight = JSON.stringify({
      id: trash.id,
      binId: pending.binId,
      destination: [pending.to.x, pending.to.y, pending.to.z],
      t,
      position: [pose.x, pose.y, pose.z],
      scale: pose.scale,
      visible: root.current.visible,
    })
    if (t >= 1) {
      if (active.endpointDrawn && !active.notified) {
        active.notified = true
        onComplete(pending)
      } else active.endpointDrawn = true
    }
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
        if (e.shiftKey && quickEnabled) onQuick(trash.id)
        else if (enabled) onPick(trash.id)
        else
          onHint(
            pending
              ? 'Подождите завершения уборки; Esc — отменить'
              : 'Для уборки включите «Взаимодействие» — Tab',
          )
      }}
    >
      <TrashModel kind={trash.kind} paperGeometry={paperGeometry} />
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
      {!animated && (enabled || quickEnabled) && (
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
export default function Cleaning({
  trash,
  items,
  pending,
  enabled,
  onPick,
  onQuick,
  onComplete,
  quickEnabled,
  onHint,
}: {
  trash: Trash[]
  items: Item[]
  pending: Disposal | null
  enabled: boolean
  onPick: (id: string) => void
  onQuick: (id: string) => void
  onComplete: (pending: Disposal) => void
  quickEnabled: boolean
  onHint: (text: string) => void
}) {
  // Shared by papers in this scene only. A module-global uploaded geometry keeps
  // renderer dispose listeners (and detached canvases) alive across new games.
  const paperGeometry = useMemo(() => {
    const geometry = new IcosahedronGeometry(0.12, 0)
    geometry.computeBoundingBox()
    return geometry
  }, [])
  useEffect(() => () => paperGeometry.dispose(), [paperGeometry])
  return (
    <group name="cleaning">
      {trash.map((t) => (
        <TrashObject
          key={t.id}
          trash={t}
          paperGeometry={paperGeometry}
          items={items}
          pending={pending}
          enabled={enabled && !pending}
          onPick={onPick}
          onQuick={onQuick}
          onComplete={onComplete}
          quickEnabled={quickEnabled && !pending}
          onHint={onHint}
        />
      ))}
    </group>
  )
}
