import { useEffect, useRef, type ComponentRef } from 'react'
import { Canvas, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MOUSE, Plane, Vector2, Vector3 } from 'three'
import House from './House'
import Furniture from './Furniture'
import { snap, validatePlacement, type Item } from './placement'

type Props = {
  items: Item[]
  selected: string | null
  draft: Item | null
  walls: boolean
  resetCamera: number
  onSelect: (id: string | null) => void
  onDraft: (item: Item | null) => void
  onCommit: (item: Item) => void
  onMessage: (s: string) => void
}
function Interior(p: Props) {
  const { camera, gl, raycaster, size } = useThree()
  const fitZoom = Math.min(46, size.width / 14, size.height / 10)
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const drag = useRef<{
    item: Item
    offset: Vector3
    pointer: number
    draft: Item
  } | null>(null)
  const current = useRef(p)
  current.current = p
  const plane = useRef(new Plane(new Vector3(0, 1, 0), 0))
  const pointAt = (x: number, y: number) => {
    const rect = gl.domElement.getBoundingClientRect()
    raycaster.setFromCamera(
      new Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    )
    return raycaster.ray.intersectPlane(plane.current, new Vector3())
  }
  useEffect(() => {
    camera.position.set(12, 11, 15)
    camera.zoom = fitZoom
    camera.updateProjectionMatrix()
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [p.resetCamera, camera, fitZoom])
  useEffect(() => {
    const cancel = () => {
      drag.current = null
      current.current.onDraft(null)
      if (controls.current) controls.current.enabled = true
    }
    const move = (e: PointerEvent) => {
      const active = drag.current
      if (!active || active.pointer !== e.pointerId) return
      const hit = pointAt(e.clientX, e.clientY)
      if (!hit) return
      const next = {
        ...active.item,
        x: snap(hit.x - active.offset.x),
        z: snap(hit.z - active.offset.z),
      }
      active.draft = next
      current.current.onDraft(next)
    }
    const up = (e: PointerEvent) => {
      const active = drag.current
      if (!active || active.pointer !== e.pointerId) return
      const error = validatePlacement(active.draft, current.current.items)
      if (error)
        current.current.onMessage(error + ' — предмет возвращён на место')
      else {
        current.current.onCommit(active.draft)
        current.current.onMessage('Предмет размещён')
      }
      cancel()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key)
    }
  }, [camera, gl, raycaster])
  function down(e: ThreeEvent<PointerEvent>, item: Item) {
    if (e.button !== 0) return
    e.stopPropagation()
    const hit = pointAt(e.clientX, e.clientY)
    if (!hit) return
    p.onSelect(item.id)
    drag.current = {
      item,
      offset: hit.sub(new Vector3(item.x, 0, item.z)),
      pointer: e.pointerId,
      draft: item,
    }
    if (controls.current) controls.current.enabled = false
    p.onDraft(item)
  }
  return (
    <>
      <ambientLight intensity={0.85} />
      <hemisphereLight args={['#fff5df', '#82917a', 1.3]} />
      <directionalLight
        position={[-3, 10, 4]}
        intensity={2.4}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.04}
      />
      <House walls={p.walls} />
      {p.items.map((item) => {
        const shown = p.draft?.id === item.id ? p.draft : item
        return (
          <Furniture
            key={item.id}
            item={shown}
            selected={p.selected === item.id}
            invalid={!!validatePlacement(shown, p.items)}
            onDown={down}
          />
        )
      })}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        minZoom={Math.min(25, fitZoom * 0.65)}
        maxZoom={95}
        minPolarAngle={0.2}
        maxPolarAngle={Math.PI / 2.15}
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: MOUSE.PAN,
          RIGHT: MOUSE.ROTATE,
        }}
      />
    </>
  )
}
export default function Scene(p: Props) {
  return (
    <Canvas
      orthographic
      shadows
      dpr={[1, 1.75]}
      camera={{ position: [12, 11, 15], zoom: 46, near: 0.1, far: 250 }}
      onPointerMissed={(e) => {
        if (e.button === 0) p.onSelect(null)
      }}
      onContextMenu={(e) => e.preventDefault()}
      fallback={
        <div className="fallback">Для 3D-сцены нужен браузер с WebGL.</div>
      }
    >
      <Interior {...p} />
    </Canvas>
  )
}
