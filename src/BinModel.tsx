import { useRef, useState } from 'react'
import { useFrame } from '@react-three/fiber'
import { Group } from 'three'

export default function BinModel({
  id,
  floorY,
  active = false,
  feedbackAt,
}: {
  id: string
  floorY: number
  active?: boolean
  feedbackAt?: number
}) {
  const [hover, setHover] = useState(false)
  const root = useRef<Group>(null)
  useFrame(() => {
    const t =
      feedbackAt === undefined
        ? 1
        : Math.min(1, (performance.now() - feedbackAt) / 280)
    root.current?.scale.setScalar(1 + Math.sin(t * Math.PI) * 0.06)
  })
  return (
    <group
      ref={root}
      position={[0, floorY, 0]}
      onPointerOver={() => setHover(true)}
      onPointerOut={() => setHover(false)}
    >
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
        <meshStandardMaterial color={hover || active ? '#60765d' : '#c0956c'} />
      </mesh>
      <mesh position={[0, 0.25, 0]} userData={{ cleaningTarget: 'bin', id }}>
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
