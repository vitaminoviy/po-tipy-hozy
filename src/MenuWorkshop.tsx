import { Canvas, useFrame, useThree } from '@react-three/fiber'
import { Component, useEffect, useMemo, useRef, type ReactNode } from 'react'
import {
  Color,
  DoubleSide,
  Group,
  InstancedMesh,
  Object3D,
  PointLight,
  Shape,
  Vector3,
  BufferGeometry,
  Float32BufferAttribute,
  CatmullRomCurve3,
  ShaderMaterial,
  MeshStandardMaterial,
} from 'three'

import { VisualMaterials, useSurface } from './visualMaterials'

type V = [number, number, number]
function Block({
  p,
  s,
  color,
  r = [0, 0, 0],
}: {
  p: V
  s: V
  color: string
  r?: V
}) {
  const grain = useSurface('oak')
  return (
    <mesh position={p} rotation={r} castShadow receiveShadow>
      <boxGeometry args={s} />
      <meshStandardMaterial
        color={color}
        roughness={0.82}
        map={grain}
        bumpMap={grain}
        bumpScale={0.018}
      />
    </mesh>
  )
}
function Window({ p, size = [0.62, 0.77] }: { p: V; size?: [number, number] }) {
  const [w, h] = size
  const glass = useRef<MeshStandardMaterial>(null)
  useFrame((state) => {
    if (glass.current)
      glass.current.emissiveIntensity =
        1.15 +
        (state.gl.domElement.dataset.motion === 'true'
          ? 0.12 * Math.sin((state.clock.elapsedTime * Math.PI) / 6 + p[0] * 2)
          : 0)
  })
  return (
    <group position={p}>
      <mesh>
        <planeGeometry args={[w, h]} />
        <meshStandardMaterial
          ref={glass}
          color="#f8b866"
          emissive="#ffac45"
          emissiveIntensity={1.4}
        />
      </mesh>
      {[-1, 1].map((i) => (
        <Block
          key={i}
          p={[(i * w) / 2, 0, 0.035]}
          s={[0.055, h + 0.1, 0.09]}
          color="#caa475"
        />
      ))}
      {[-1, 0, 1].map((i) => (
        <Block
          key={i}
          p={[0, (i * h) / 2, 0.045]}
          s={[w + 0.09, 0.045, 0.09]}
          color="#caa475"
        />
      ))}
      <Block p={[0, 0, 0.05]} s={[0.035, h, 0.09]} color="#9f7954" />
      <Block
        p={[0, -h / 2 - 0.08, 0.1]}
        s={[w + 0.2, 0.09, 0.28]}
        color="#d9c3a3"
      />
      <mesh position={[0, 0, -0.08]}>
        <planeGeometry args={[w, h]} />
        <meshBasicMaterial color="#ffce81" />
      </mesh>
    </group>
  )
}
function Plant({
  p,
  hanging = false,
  phase = 0,
}: {
  p: V
  hanging?: boolean
  phase?: number
}) {
  const leaves = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), [])
  const animate = useRef(0)
  const count = 32
  const leafGeometry = useMemo(() => {
    const vertices: number[] = [],
      indices: number[] = []
    for (let y = 0; y <= 10; y++)
      for (let x = 0; x <= 4; x++) {
        const t = y / 10,
          v = x / 2 - 1,
          w = Math.sin(Math.PI * t) * (0.85 + 0.15 * t)
        vertices.push(
          v * w,
          t * 2,
          0.28 * Math.sin(Math.PI * t) * (1 - v * v) + 0.2 * t * t,
        )
      }
    for (let y = 0; y < 10; y++)
      for (let x = 0; x < 4; x++) {
        const a = y * 5 + x
        indices.push(a, a + 1, a + 5, a + 1, a + 6, a + 5)
      }
    const geometry = new BufferGeometry()
    geometry.setAttribute('position', new Float32BufferAttribute(vertices, 3))
    geometry.setIndex(indices)
    geometry.computeVertexNormals()
    return geometry
  }, [])
  useEffect(() => () => leafGeometry.dispose(), [leafGeometry])
  const stems = useMemo(
    () =>
      Array.from(
        { length: 4 },
        (_, branch) =>
          new CatmullRomCurve3(
            Array.from({ length: 8 }, (_, step) => {
              const a = (branch * Math.PI) / 2 + phase,
                spread = 0.12 + step * 0.045
              return new Vector3(
                Math.cos(a) * spread,
                hanging ? -0.12 - step * 0.105 : 0.12 + step * 0.08,
                Math.sin(a) * spread,
              )
            }),
          ),
      ),
    [hanging, phase],
  )
  useFrame((state, delta) => {
    if (!leaves.current) return
    animate.current += delta
    const active = state.gl.domElement.dataset.motion === 'true'
    const t = active ? (animate.current * Math.PI) / 6 : 0
    for (let i = 0; i < count; i++) {
      const branch = i % 4,
        step = Math.floor(i / 4),
        a = (branch * Math.PI) / 2 + phase
      const sway = active ? Math.sin(t + step * 0.35 + phase) * 0.075 : 0
      const spread = 0.12 + step * 0.045
      dummy.position.set(
        Math.cos(a) * spread + sway * step * 0.18,
        hanging ? -0.12 - step * 0.105 : 0.12 + step * 0.08,
        Math.sin(a) * spread,
      )
      dummy.rotation.set(
        0.4 + Math.sin(i) * 0.35,
        a + sway * 2,
        hanging ? 0.5 + sway : -0.5 + sway,
      )
      dummy.scale.set(0.13 + step * 0.005, 0.23, 0.035)
      dummy.updateMatrix()
      leaves.current.setMatrixAt(i, dummy.matrix)
    }
    leaves.current.instanceMatrix.needsUpdate = true
  })
  return (
    <group position={p}>
      <mesh position={[0, -0.1, 0]} castShadow>
        <cylinderGeometry args={[0.25, 0.18, 0.32, 20]} />
        <meshStandardMaterial
          color={hanging ? '#7d5b3b' : '#9a5f43'}
          roughness={0.9}
        />
      </mesh>
      {hanging &&
        [-1, 1].map((i) => (
          <mesh
            key={i}
            position={[i * 0.15, 0.6, 0]}
            rotation={[0, 0, i * -0.12]}
          >
            <cylinderGeometry args={[0.008, 0.008, 1.4, 5]} />
            <meshStandardMaterial color="#bca77b" />
          </mesh>
        ))}
      {stems.map((curve, i) => (
        <mesh key={i}>
          <tubeGeometry args={[curve, 12, 0.012, 4, false]} />
          <meshStandardMaterial color="#66653f" />
        </mesh>
      ))}
      <instancedMesh
        ref={leaves}
        args={[leafGeometry, undefined, count]}
        castShadow
      >
        <meshStandardMaterial
          color={phase > 1 ? '#698052' : '#405c45'}
          roughness={0.85}
          side={DoubleSide}
        />
      </instancedMesh>
    </group>
  )
}
function House() {
  const gable = useMemo(() => {
    const s = new Shape()
    s.moveTo(-1.35, 0)
    s.lineTo(1.35, 0)
    s.lineTo(0, 1.15)
    s.closePath()
    return s
  }, [])
  return (
    <group position={[1.1, 0.12, 0]}>
      <Block p={[0, -0.05, 0]} s={[4, 0.2, 3.8]} color="#5c4937" />
      <Block p={[0, 0.07, 0]} s={[3.8, 0.12, 3.6]} color="#8a8664" />
      <Block p={[0, 1.25, 0]} s={[2.7, 2.3, 2.15]} color="#cbb998" />
      <mesh position={[0, 2.4, 1.076]}>
        <shapeGeometry args={[gable]} />
        <meshStandardMaterial color="#bcad93" side={DoubleSide} />
      </mesh>
      <mesh position={[0, 2.4, -1.076]} rotation={[0, Math.PI, 0]}>
        <shapeGeometry args={[gable]} />
        <meshStandardMaterial color="#bcad93" side={DoubleSide} />
      </mesh>
      {/* Individual overlapping roof courses give a readable crafted silhouette. */}
      {[-1, 1].map((side) => (
        <group
          key={side}
          position={[side * 0.76, 2.96, 0]}
          rotation={[0, 0, -side * 0.705]}
        >
          <Block p={[0, 0, 0]} s={[2, 0.12, 2.65]} color="#303d43" />
          {Array.from({ length: 8 }, (_, row) =>
            Array.from({ length: 6 }, (_, col) => (
              <Block
                key={`${row}-${col}`}
                p={[
                  -0.86 + row * 0.245,
                  0.08 + row * 0.002,
                  -1.09 + col * 0.435,
                ]}
                s={[0.29, 0.045, 0.42]}
                color={['#46545a', '#3c4a50', '#4c5759'][(row + col) % 3]}
              />
            )),
          )}
        </group>
      ))}
      <Block p={[0.7, 3.32, -0.55]} s={[0.35, 1.05, 0.4]} color="#805b4a" />
      <Block p={[0.7, 3.87, -0.55]} s={[0.47, 0.12, 0.5]} color="#ab8266" />
      {[-1.32, 1.32].map((x) => (
        <Block
          key={x}
          p={[x, 1.28, 1.1]}
          s={[0.12, 2.35, 0.12]}
          color="#72573d"
        />
      ))}
      <Block p={[0, 1.55, 1.12]} s={[2.75, 0.12, 0.12]} color="#72573d" />
      <Window p={[-0.73, 2, 1.115]} size={[0.7, 0.64]} />
      <Window p={[0.73, 2, 1.115]} size={[0.7, 0.64]} />
      <Window p={[-0.8, 0.85, 1.115]} size={[0.65, 0.86]} />
      <Window p={[0.8, 0.85, 1.115]} size={[0.65, 0.86]} />
      <Block p={[0, 0.69, 1.12]} s={[0.52, 1.16, 0.12]} color="#3c605d" />
      <Window p={[0, 0.91, 1.195]} size={[0.3, 0.35]} />
      <mesh position={[0.17, 0.52, 1.21]}>
        <sphereGeometry args={[0.035, 10, 8]} />
        <meshStandardMaterial color="#d5b371" metalness={0.6} roughness={0.3} />
      </mesh>
      {[0, 1, 2].map((i) => (
        <Block
          key={i}
          p={[0, 0.1 - i * 0.055, 1.32 + i * 0.21]}
          s={[0.85, 0.14, 0.3]}
          color="#ab9b81"
        />
      ))}
      <group rotation={[0, Math.PI / 2, 0]} position={[1.36, 0, 0]}>
        <Window p={[0, 1, 0]} size={[1.05, 1.1]} />
        <Window p={[0, 2, 0]} size={[0.75, 0.6]} />
      </group>
      {[-0.8, 0.8].map((x) => (
        <group key={x} position={[x, 1.55, 1.32]}>
          <Block p={[0, 0, 0]} s={[0.8, 0.18, 0.25]} color="#694f37" />
          {[-0.24, 0, 0.24].map((a, i) => (
            <mesh key={a} position={[a, 0.18, 0]}>
              <sphereGeometry args={[0.13, 8, 6]} />
              <meshStandardMaterial color={i % 2 ? '#ac8a9c' : '#6f8252'} />
            </mesh>
          ))}
        </group>
      ))}
      <Plant p={[-1.57, 0.3, 0.8]} phase={1} />
      <Plant p={[1.52, 0.3, -0.6]} phase={2} />
      <mesh position={[0, 2.75, 1.09]}>
        <torusGeometry args={[0.21, 0.045, 8, 24]} />
        <meshStandardMaterial color="#dbc59f" />
      </mesh>
    </group>
  )
}
function Workshop({ motion }: { motion: boolean }) {
  const { camera, size, gl, invalidate } = useThree()
  const lamp = useRef<Group>(null),
    warm = useRef<PointLight>(null)
  const time = useRef(0)
  const sky = useRef<ShaderMaterial>(null)
  useEffect(() => {
    camera.position.set(8.3, 5.2, 11.8)
    camera.lookAt(size.width / size.height < 0.8 ? 1 : -1.8, 1.1, 0)
    gl.domElement.dataset.motion = String(motion)
    gl.domElement.dataset.menuScene = 'ready'
    invalidate()
  }, [camera, size, motion, gl, invalidate])
  useFrame((state, delta) => {
    if (motion) time.current += Math.min(delta, 0.1)
    const t = (time.current * Math.PI) / 6
    if (sky.current) sky.current.uniforms.time.value = t
    if (lamp.current) lamp.current.rotation.z = motion ? Math.sin(t) * 0.045 : 0
    if (warm.current)
      warm.current.intensity = 6 + (motion ? Math.sin(t + 0.8) * 0.6 : 0)
    state.gl.domElement.dataset.scenePhase = String(time.current.toFixed(2))
  })
  return (
    <>
      <color attach="background" args={['#171c27']} />
      <fog attach="fog" args={['#20212c', 16, 35]} />
      <ambientLight intensity={0.85} color="#a9bddb" />
      <directionalLight
        position={[-3, 7, -4]}
        intensity={1.6}
        color="#e4b9a4"
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-bias={-0.0005}
        shadow-radius={4}
      />
      <pointLight
        ref={warm}
        position={[1, 2, 2]}
        color="#ffbb65"
        intensity={6}
        distance={8}
      />
      <Block p={[0, -0.32, 0]} s={[26, 0.55, 22]} color="#76543c" />
      {Array.from({ length: 26 }, (_, i) => (
        <Block
          key={i}
          p={[-12.5 + i, -0.025, 0]}
          s={[0.975, 0.04, 22]}
          color={['#75553c', '#805d41', '#6c4e38', '#896449'][i % 4]}
        />
      ))}
      <Block p={[0, 3, -4.2]} s={[19, 8, 0.3]} color="#303330" />
      {/* Dusk window and mullions form actual room depth, not a backdrop photograph. */}
      <mesh position={[2.5, 3.4, -4.01]}>
        <planeGeometry args={[9, 6.4]} />
        <shaderMaterial
          ref={sky}
          uniforms={{
            time: { value: 0 },
            top: { value: new Color('#536183') },
            bottom: { value: new Color('#dc9e84') },
          }}
          vertexShader={
            'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}'
          }
          fragmentShader={
            'varying vec2 vUv;uniform vec3 top;uniform vec3 bottom;uniform float time;void main(){vec3 c=mix(bottom,top,smoothstep(0.,1.,vUv.y));float cloud=sin(vUv.x*19.+sin(time)*.3+sin(vUv.y*38.))*sin(vUv.y*41.+cos(time)*.2);c=mix(c,vec3(.48,.43,.52),smoothstep(.3,.85,cloud)*.25);gl_FragColor=vec4(c,1.);}'
          }
        />
      </mesh>
      {[-2, 1, 4, 7].map((x) => (
        <Block
          key={x}
          p={[x, 3.2, -3.8]}
          s={[0.16, 6.8, 0.25]}
          color="#725943"
        />
      ))}
      {[0.2, 3.5, 6.7].map((y) => (
        <Block
          key={y}
          p={[2.5, y, -3.8]}
          s={[9.3, 0.16, 0.25]}
          color="#725943"
        />
      ))}
      <Block p={[2.5, 0.35, -3.5]} s={[9.5, 0.2, 0.8]} color="#987450" />
      {Array.from({ length: 17 }, (_, i) => (
        <Block
          key={i}
          p={[-1.8 + i * 0.5, 0.5 + (i % 3) * 0.13, -3.97]}
          s={[0.43, 1.1 + (i % 3) * 0.26, 0.025]}
          color={i % 2 ? '#454856' : '#514b5b'}
        />
      ))}
      <mesh position={[5.5, 5.3, -3.96]}>
        <circleGeometry args={[0.28, 32]} />
        <meshBasicMaterial color="#e0c9ad" />
      </mesh>
      <House />
      <Plant p={[5.3, 0.25, -2.2]} phase={2} />
      <Plant p={[0.2, 5, -2.8]} hanging phase={0.5} />
      <Plant p={[4.9, 5.3, -2.6]} hanging phase={2.4} />
      <group ref={lamp} position={[4.5, 5.6, 0.2]}>
        <mesh position={[0, -0.55, 0]}>
          <cylinderGeometry args={[0.02, 0.02, 1.1, 8]} />
          <meshStandardMaterial color="#302c27" />
        </mesh>
        <mesh position={[0, -1.25, 0]} castShadow>
          <coneGeometry args={[0.78, 0.65, 32, 1, true]} />
          <meshStandardMaterial
            color="#a17c42"
            metalness={0.65}
            roughness={0.35}
            side={DoubleSide}
          />
        </mesh>
        <mesh position={[0, -1.48, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[0.65, 32]} />
          <meshBasicMaterial color="#ffdc9c" side={DoubleSide} />
        </mesh>
        <pointLight
          position={[0, -1.7, 0]}
          intensity={18}
          color="#ffd495"
          distance={10}
        />
      </group>
      {/* Workshop objects, all original geometry. */}
      {Array.from({ length: 9 }, (_, i) => (
        <group
          key={i}
          position={[-4.7 + i * 0.28, 0.1, -2.5]}
          rotation={[0, 0, ((i % 3) - 0.5) * 0.05]}
        >
          <Block
            p={[0, 0.5, 0]}
            s={[0.22, 1 + (i % 3) * 0.12, 0.75]}
            color={['#4c6261', '#9c7552', '#605064'][i % 3]}
          />
          <Block p={[0, 0.1, 0.39]} s={[0.19, 0.025, 0.01]} color="#bdab7b" />
        </group>
      ))}
      <Block p={[-4.9, 1.6, -3.2]} s={[3.5, 0.15, 1.2]} color="#614a35" />
      <Plant p={[-4.1, 1.88, -3]} hanging phase={1} />
      <group position={[3.6, 0.1, 2.6]} rotation={[0, -0.3, 0]}>
        <Block p={[0, 0, 0]} s={[1.3, 0.13, 0.95]} color="#495f61" />
        <Block p={[0.1, 0.12, 0]} s={[1.1, 0.11, 0.85]} color="#aa8960" />
        <Block p={[0.1, 0.2, 0]} s={[1.04, 0.06, 0.8]} color="#d5c9a5" />
      </group>
      <mesh position={[-0.7, 0.23, 2.6]} castShadow>
        <cylinderGeometry args={[0.25, 0.22, 0.46, 24]} />
        <meshStandardMaterial color="#b4c3b3" roughness={0.4} />
      </mesh>
      <mesh position={[-0.41, 0.25, 2.6]} rotation={[0, 0, 0]}>
        <torusGeometry args={[0.14, 0.035, 8, 20]} />
        <meshStandardMaterial color="#b4c3b3" />
      </mesh>
      <mesh position={[-0.7, 0.468, 2.6]} rotation={[-Math.PI / 2, 0, 0]}>
        <circleGeometry args={[0.215, 24]} />
        <meshStandardMaterial color="#39281c" />
      </mesh>
      <Block
        p={[0.5, 0.03, 2.7]}
        s={[1.4, 0.02, 0.7]}
        color="#c8b896"
        r={[0, 0.3, 0]}
      />
      <Block
        p={[0.8, 0.07, 2.7]}
        s={[1.1, 0.035, 0.035]}
        color="#735c3f"
        r={[0, -0.3, 0]}
      />
    </>
  )
}
class SceneBoundary extends Component<
  { children: ReactNode },
  { failed: boolean }
> {
  state = { failed: false }
  static getDerivedStateFromError() {
    return { failed: true }
  }
  render() {
    return this.state.failed ? (
      <div className="menu-scene-fallback" />
    ) : (
      this.props.children
    )
  }
}
export default function MenuWorkshop({ motion }: { motion: boolean }) {
  return (
    <SceneBoundary>
      <Canvas
        className="menu-workshop-canvas"
        shadows
        dpr={[1, 1.35]}
        frameloop={motion ? 'always' : 'demand'}
        camera={{ position: [8.3, 5.8, 11.8], fov: 42, near: 0.1, far: 50 }}
        gl={{ antialias: true, alpha: false, powerPreference: 'low-power' }}
      >
        <VisualMaterials>
          <Workshop motion={motion} />
        </VisualMaterials>
      </Canvas>
    </SceneBoundary>
  )
}
