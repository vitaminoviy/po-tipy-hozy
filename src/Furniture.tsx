import { useFrame, type ThreeEvent } from '@react-three/fiber'
import { useMemo, useRef } from 'react'
import {
  Shape,
  Path,
  Group,
  PointLight,
  MeshStandardMaterial,
  Color,
} from 'three'
import type { Item, WorldItem } from './placement'
import { catalog, footprint, drawerSpecs } from './placement'
import { approach, type Interaction, type Mode } from './history'

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
function Drawer({
  y,
  index,
  interactive,
  onInteract,
  width = 1.38,
  depth = 0.54,
  center = 0.06,
  motion,
  motionKey,
}: {
  y: number
  index: number
  interactive: boolean
  onInteract: (action: Interaction) => void
  width?: number
  depth?: number
  center?: number
  motion: Map<string, number>
  motionKey: string
}) {
  const group = useRef<Group>(null)
  useFrame(() => {
    if (group.current) group.current.position.z = motion.get(motionKey) ?? 0
  })
  return (
    <group
      ref={group}
      position={[0, y, 0]}
      onPointerDown={(e) => {
        if (interactive && e.button === 0 && e.buttons === 1) {
          e.stopPropagation()
          onInteract({ kind: 'drawer', index })
        }
      }}
    >
      <Box
        p={[0, 0, center + depth / 2 + 0.015]}
        s={[width, 0.28, 0.03]}
        c="#bc936a"
      />
      <Box
        p={[0, 0, center + depth / 2 + 0.04]}
        s={[width > 1 ? 0.22 : 0.13, 0.035, 0.04]}
        c="#70553a"
      />
      <Box
        p={[0, -0.105, center]}
        s={[width - 0.08, 0.03, depth]}
        c="#806145"
      />
      {[-1, 1].map((side) => (
        <Box
          key={side}
          p={[side * (width / 2 - 0.06), -0.005, center]}
          s={[0.04, 0.2, depth]}
          c="#ac825c"
        />
      ))}
      <Box
        p={[0, -0.005, center - depth / 2]}
        s={[width - 0.08, 0.2, 0.035]}
        c="#ac825c"
      />
    </group>
  )
}
function Lamp({ on }: { on: boolean }) {
  const light = useRef<PointLight>(null),
    shade = useRef<MeshStandardMaterial>(null),
    level = useRef(0)
  const offColor = useMemo(() => new Color('#d5c8ab'), []),
    onColor = useMemo(() => new Color('#fff1c8'), [])
  useFrame((_, dt) => {
    level.current = approach(level.current, on ? 1 : 0, dt, 7)
    if (light.current) light.current.intensity = 14 * level.current
    if (shade.current) {
      shade.current.emissiveIntensity = 0.03 + level.current * 1.3
      shade.current.color.lerpColors(offColor, onColor, level.current)
    }
  })
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
          ref={shade}
          color="#d5c8ab"
          emissive="#ffd18e"
          emissiveIntensity={0.03}
        />
      </mesh>
      <pointLight
        ref={light}
        position={[0, 1.3, 0]}
        color="#ffd18e"
        intensity={0}
        distance={6}
        decay={2}
      />
    </>
  )
}
function Model({
  item,
  interactive,
  onInteract,
  drawerMotion,
}: {
  item: Item
  interactive: boolean
  onInteract: (action: Interaction) => void
  drawerMotion: Map<string, number>
}) {
  const kind = item.kind
  const wood = '#a87546',
    cream = '#e9dec9'
  switch (kind) {
    case 'sofa':
      return (
        <>
          <Box p={[0, 0.45, 0]} s={[2.5, 0.55, 1.1]} c="#4e6955" />
          <Box p={[0, 0.95, -0.43]} s={[2.5, 0.8, 0.24]} c="#6c8468" />
          {[-1.1, 1.1].map((x) => (
            <Box key={x} p={[x, 0.78, 0]} s={[0.28, 0.5, 1.1]} c="#6c8468" />
          ))}
          {[-0.53, 0.53].map((x) => (
            <Box
              key={x}
              p={[x, 0.78, 0.03]}
              s={[0.97, 0.15, 0.79]}
              c="#8ca176"
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
          <Box p={[0, 0.8, 0.35]} s={[1.96, 0.16, 1.8]} c="#8b9c88" />
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
          {[-0.71, 0.71].map((x) => (
            <Box key={x} p={[x, 0.65, 0]} s={[0.08, 1.1, 0.65]} c={wood} />
          ))}
          <Box p={[0, 0.65, -0.3]} s={[1.34, 1.1, 0.05]} c="#8b6546" />
          {[0.12, 0.47, 0.82].map((y) => (
            <Box key={y} p={[0, y, 0]} s={[1.34, 0.03, 0.65]} c={wood} />
          ))}
          <Box p={[0, 1.24, 0]} s={[1.58, 0.09, 0.72]} c="#caa47b" />
          {[0.3, 0.65, 1].map((y, index) => (
            <Drawer
              key={index}
              y={y}
              index={index}
              interactive={interactive}
              onInteract={onInteract}
              motion={drawerMotion}
              motionKey={`${item.id}:${index}`}
            />
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
      return <Lamp on={!!item.lampOn} />
    case 'nightstand':
      return (
        <>
          {[-0.325, 0.325].map((x) => (
            <Box key={x} p={[x, 0.4, 0]} s={[0.05, 0.7, 0.6]} c={wood} />
          ))}
          <Box p={[0, 0.4, -0.275]} s={[0.6, 0.7, 0.05]} c={wood} />
          <Box p={[0, 0.2, 0]} s={[0.6, 0.3, 0.6]} c={wood} />
          <Box p={[0, 0.78, 0]} s={[0.76, 0.08, 0.7]} c="#caa47b" />
          <Drawer
            {...drawerSpecs(item)[0]}
            index={0}
            interactive={interactive}
            onInteract={onInteract}
            motion={drawerMotion}
            motionKey={`${item.id}:0`}
          />
        </>
      )
    case 'book':
      return (
        <>
          <Box p={[0, 0.005, 0]} s={[0.36, 0.01, 0.26]} c="#496f76" />
          <Box p={[0, 0.0325, 0]} s={[0.34, 0.045, 0.24]} c={cream} />
          <Box p={[0, 0.06, 0]} s={[0.36, 0.01, 0.26]} c="#496f76" />
          <Box p={[-0.175, 0.0325, 0]} s={[0.01, 0.055, 0.26]} c="#496f76" />
        </>
      )
    case 'cup':
      return (
        <>
          <mesh position={[0, 0.085, 0]} castShadow>
            <cylinderGeometry args={[0.09, 0.07, 0.17, 24]} />
            <meshStandardMaterial color={cream} />
          </mesh>
          <mesh position={[0, 0.171, 0]} rotation={[-Math.PI / 2, 0, 0]}>
            <circleGeometry args={[0.075, 24]} />
            <meshStandardMaterial color="#75533d" />
          </mesh>
          <mesh position={[0.085, 0.105, 0]} castShadow>
            <torusGeometry args={[0.028, 0.01, 8, 20]} />
            <meshStandardMaterial color={cream} />
          </mesh>
        </>
      )
    case 'box':
      return (
        <>
          <Box p={[0, 0.09, 0]} s={[0.28, 0.18, 0.25]} c="#b27c69" />
          <Box p={[0, 0.195, 0]} s={[0.28, 0.03, 0.25]} c="#c8937b" />
          <Box p={[0, 0.212, 0]} s={[0.045, 0.004, 0.25]} c="#e8d7b5" />
        </>
      )
    case 'rug':
    case 'bedroomRug': {
      const [w, d] = catalog[kind].size
      const y = kind === 'rug' ? 0.027 : 0.03
      return (
        <>
          <Box
            p={[0, y, 0]}
            s={[w, 0.018, d]}
            c={catalog[kind].color}
            castShadow={false}
          />
          {[-1, 1].map((side) => (
            <Box
              key={side}
              p={[0, y + 0.012, side * (d / 2 - 0.14)]}
              s={[w - 0.16, 0.006, 0.045]}
              c="#dfd7bc"
              castShadow={false}
            />
          ))}
        </>
      )
    }
  }
}
function PlacementMarker({
  item,
  invalid = false,
}: {
  item: WorldItem
  invalid?: boolean
}) {
  const [w, d] = footprint(item),
    circle = catalog[item.kind].shape === 'circle'
  const color = invalid ? '#dc4938' : '#218c53'
  const frame = useMemo(() => {
    const outerX = w / 2 + 0.07,
      outerY = d / 2 + 0.07,
      innerX = w / 2 + 0.035,
      innerY = d / 2 + 0.035
    const shape = new Shape()
    shape.moveTo(-outerX, -outerY)
    shape.lineTo(outerX, -outerY)
    shape.lineTo(outerX, outerY)
    shape.lineTo(-outerX, outerY)
    shape.closePath()
    const hole = new Path()
    hole.moveTo(-innerX, -innerY)
    hole.lineTo(-innerX, innerY)
    hole.lineTo(innerX, innerY)
    hole.lineTo(innerX, -innerY)
    hole.closePath()
    shape.holes.push(hole)
    return shape
  }, [w, d])
  return (
    <group
      name="placement-marker"
      position={[
        item.x,
        item.y +
          (catalog[item.kind].category === 'surfaceDecor' ? 0.008 : 0.065),
        item.z,
      ]}
    >
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
        renderOrder={10}
      >
        {circle ? (
          <circleGeometry args={[w / 2 + 0.035, 48]} />
        ) : (
          <planeGeometry args={[w + 0.07, d + 0.07]} />
        )}
        <meshBasicMaterial
          color={color}
          transparent
          opacity={0.18}
          depthWrite={false}
        />
      </mesh>
      <mesh
        position={[0, 0.002, 0]}
        rotation={[-Math.PI / 2, 0, 0]}
        raycast={() => null}
        renderOrder={20}
      >
        {circle ? (
          <ringGeometry args={[w / 2 + 0.035, w / 2 + 0.07, 64]} />
        ) : (
          <shapeGeometry args={[frame]} />
        )}
        <meshBasicMaterial
          color={color}
          depthTest={false}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
    </group>
  )
}
export default function Furniture({
  item,
  selected,
  invalid,
  onDown,
  mode,
  onInteract,
  drawerMotion,
}: {
  item: WorldItem
  selected: boolean
  invalid: boolean
  onDown: (e: ThreeEvent<PointerEvent>, item: Item) => void
  mode: Mode
  onInteract: (action: Interaction) => void
  drawerMotion: Map<string, number>
}) {
  return (
    <>
      {selected && <PlacementMarker item={item} invalid={invalid} />}
      <group position={[item.x, item.y, item.z]}>
        <group
          rotation={[0, (item.rotation * Math.PI) / 2, 0]}
          onPointerDown={(e) => onDown(e, item)}
          onPointerOver={(e) => {
            e.stopPropagation()
            document.body.style.cursor =
              mode === 'interact' ? 'pointer' : 'grab'
          }}
          onPointerOut={() => {
            document.body.style.cursor = 'auto'
          }}
        >
          <Model
            item={item}
            interactive={mode === 'interact'}
            onInteract={onInteract}
            drawerMotion={drawerMotion}
          />
        </group>
      </group>
    </>
  )
}
