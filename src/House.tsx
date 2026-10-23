import { Box } from './Furniture'

function WindowWall({ x, color }: { x: number; color: string }) {
  return (
    <group>
      <Box p={[x, 0.55, -3.5]} s={[5, 1.1, 0.18]} c={color} />
      <Box p={[x, 2.75, -3.5]} s={[5, 0.5, 0.18]} c={color} />
      {[-1.8, 1.8].map((dx) => (
        <Box key={dx} p={[x + dx, 1.8, -3.5]} s={[1.4, 1.4, 0.18]} c={color} />
      ))}
      <Box
        p={[x, 1.8, -3.52]}
        s={[2.2, 1.4, 0.06]}
        c="#b9d3cf"
        castShadow={false}
      />
      {[-1.1, 0, 1.1].map((dx) => (
        <Box
          key={dx}
          p={[x + dx, 1.8, -3.38]}
          s={[0.07, 1.5, 0.12]}
          c="#faf1dc"
          radius={0.012}
        />
      ))}
      {[1.08, 1.8, 2.52].map((y) => (
        <Box
          key={y}
          p={[x, y, -3.38]}
          s={[2.3, 0.07, 0.12]}
          c="#faf1dc"
          radius={0.012}
        />
      ))}
      <Box
        p={[x, 1.06, -3.25]}
        s={[2.5, 0.1, 0.38]}
        c="#e8dcc4"
        radius={0.02}
        surface="wood"
      />
    </group>
  )
}
export default function House({ walls }: { walls: boolean }) {
  return (
    <group>
      <Box
        p={[0, -0.25, 0]}
        s={[10.5, 0.45, 7.5]}
        c="#cabda8"
        radius={0.065}
        surface="wood"
      />
      {Array.from({ length: 28 }, (_, i) => (
        <Box
          key={i}
          p={[0, -0.015, -3.375 + i * 0.25]}
          s={[10, 0.06, 0.238]}
          surface="wood"
          c={i % 3 === 0 ? '#bc9165' : i % 3 === 1 ? '#d0a77a' : '#c69a6c'}
        />
      ))}
      {walls ? (
        <>
          <WindowWall x={-2.5} color="#e2d8c1" />
          <WindowWall x={2.5} color="#aebda5" />
          <Box p={[-5, 1.5, 0]} s={[0.18, 3, 7]} c="#e2d8c1" />
          <Box p={[5, 0.36, 0]} s={[0.18, 0.72, 7]} c="#aebda5" />
          <Box p={[0, 1.5, -1.4]} s={[0.18, 3, 4.2]} c="#c3c5ad" />
          <Box p={[0, 0.36, 2.95]} s={[0.18, 0.72, 1.1]} c="#dedcc8" />
          <Box p={[0, 2.75, 1.55]} s={[0.18, 0.5, 1.7]} c="#dedcc8" />
          {[0.7, 2.4].map((z) => (
            <Box key={z} p={[0, 1.2, z]} s={[0.23, 2.4, 0.1]} c="#f0e6d0" />
          ))}
          <Box p={[-1.75, 0.28, 3.5]} s={[6.5, 0.56, 0.18]} c="#e7e0cc" />
          <Box p={[4.05, 0.28, 3.5]} s={[1.9, 0.56, 0.18]} c="#d4dcca" />
          <Box p={[1.65, 1.15, 3.5]} s={[0.1, 2.3, 0.2]} c="#f0e6d0" />
          <Box p={[3.15, 1.15, 3.5]} s={[0.1, 2.3, 0.2]} c="#f0e6d0" />
          <Box p={[2.4, 2.3, 3.5]} s={[1.6, 0.12, 0.2]} c="#f0e6d0" />
          <group position={[3.1, 0, 3.5]} rotation={[0, -1.12, 0]}>
            <Box p={[-0.7, 1.08, 0]} s={[1.4, 2.16, 0.09]} c="#a3ad93" />
            <Box p={[-1.24, 1.05, -0.08]} s={[0.06, 0.06, 0.08]} c="#a07e42" />
          </group>
          <Box p={[-2.5, 0.12, -3.36]} s={[4.8, 0.18, 0.06]} c="#faf0db" />
          <Box p={[2.5, 0.12, -3.36]} s={[4.8, 0.18, 0.06]} c="#faf0db" />
        </>
      ) : (
        <>
          <Box p={[0, 0.035, 0]} s={[0.18, 0.05, 7]} c="#aaa78e" />
        </>
      )}
      <Box
        p={[2.4, -0.12, 3.9]}
        s={[2, 0.18, 0.7]}
        c="#c8bda8"
        radius={0.025}
      />
      <mesh
        receiveShadow
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, -0.49, 0]}
      >
        <planeGeometry args={[200, 200]} />
        <meshStandardMaterial color="#e8e1d6" roughness={1} />
      </mesh>
    </group>
  )
}
