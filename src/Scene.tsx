import { useEffect, useRef, type ComponentRef } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MOUSE, Plane, Vector2, Vector3 } from 'three'
import House from './House'
import Furniture from './Furniture'
import {
  placementCandidate,
  validatePlacement,
  worldPose,
  surfaceLocal,
  catalog,
  isSmall,
  type Item,
} from './placement'
import type { Mode, Interaction } from './history'

type Props = {
  items: Item[]
  selected: string | null
  draft: Item | null
  placing: boolean
  walls: boolean
  resetCamera: number
  onSelect: (id: string | null) => void
  onDraft: (item: Item | null) => void
  onCommit: (item: Item) => void
  onMessage: (s: string) => void
  onPlacementEnd: () => void
  mode: Mode
  cancelToken: number
  onInteract: (id: string, action: Interaction) => void
  onTake: (id: string) => void
}
function Interior(p: Props) {
  const { camera, gl, raycaster, size } = useThree()
  const fitZoom = Math.min(46, size.width / 14, size.height / 10)
  const renderedFrames = useRef(0)
  // Canvas DOM presence precedes the first scene render / world matrices.
  useFrame(() => {
    if (renderedFrames.current < 2 && ++renderedFrames.current === 2)
      gl.domElement.dataset.sceneReady = 'true'
  })
  const controls = useRef<ComponentRef<typeof OrbitControls>>(null)
  const drag = useRef<{
    item: Item
    offset: Vector3
    pointer: number
    draft: Item
    screen: Vector2
    moved: boolean
    token: number
  } | null>(null)
  const current = useRef(p)
  current.current = p
  const plane = useRef(new Plane(new Vector3(0, 1, 0), 0))
  const pointAt = (x: number, y: number, height = 0) => {
    const rect = gl.domElement.getBoundingClientRect()
    raycaster.setFromCamera(
      new Vector2(
        ((x - rect.left) / rect.width) * 2 - 1,
        (-(y - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    )
    plane.current.constant = -height
    return raycaster.ray.intersectPlane(plane.current, new Vector3())
  }
  const candidateAt = (
    item: Item,
    x: number,
    y: number,
    offset = new Vector3(),
  ): Item | null => {
    const props = current.current
    const floor = pointAt(x, y)
    if (!isSmall(item))
      return floor
        ? placementCandidate(item, floor.x - offset.x, floor.z - offset.z)
        : null
    const orientation = worldPose(item, props.items).rotation
    let nearest: { item: Item; distance: number } | null = null
    for (const parent of props.items) {
      const surface = catalog[parent.kind].surface
      if (!surface) continue
      const hit = raycaster.ray.intersectPlane(
        new Plane(new Vector3(0, 1, 0), -surface.height),
        new Vector3(),
      )
      if (!hit) continue
      const underCursor = surfaceLocal(parent, hit.x, hit.z)
      if (
        Math.abs(underCursor.x) > surface.size[0] / 2 ||
        Math.abs(underCursor.z) > surface.size[1] / 2
      )
        continue
      const local = surfaceLocal(parent, hit.x - offset.x, hit.z - offset.z),
        distance = hit.distanceToSquared(raycaster.ray.origin)
      if (!nearest || distance < nearest.distance)
        nearest = {
          item: {
            ...item,
            ...local,
            surfaceId: parent.id,
            rotation: (orientation - parent.rotation + 4) % 4,
          },
          distance,
        }
    }
    return (
      nearest?.item ??
      (floor
        ? {
            ...item,
            x: floor.x - offset.x,
            z: floor.z - offset.z,
            surfaceId: undefined,
            rotation: orientation,
          }
        : null)
    )
  }
  const cancelGesture = useRef(() => {})
  useEffect(() => {
    camera.position.set(12, 11, 15)
    camera.zoom = fitZoom
    camera.updateProjectionMatrix()
    controls.current?.target.set(0, 0, 0)
    controls.current?.update()
  }, [p.resetCamera, camera, fitZoom])
  useEffect(() => {
    const cancel = () => {
      const pointer = drag.current?.pointer
      if (pointer !== undefined && gl.domElement.hasPointerCapture(pointer))
        gl.domElement.releasePointerCapture(pointer)
      drag.current = null
      current.current.onDraft(null)
      current.current.onPlacementEnd()
      document.body.style.cursor = 'auto'
      if (controls.current) controls.current.enabled = true
    }
    cancelGesture.current = cancel
    const move = (e: PointerEvent) => {
      const active = drag.current,
        props = current.current
      if (!active) {
        if (!props.placing || e.buttons !== 0) return
        const item = props.items.find((i) => i.id === props.selected)
        if (!item) return
        const rect = gl.domElement.getBoundingClientRect()
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          return
        const candidate = candidateAt(props.draft ?? item, e.clientX, e.clientY)
        if (candidate) props.onDraft(candidate)
        return
      }
      if (active.pointer !== e.pointerId) return
      if (active.token !== props.cancelToken) {
        cancel()
        return
      }
      if (
        !active.moved &&
        active.screen.distanceTo(new Vector2(e.clientX, e.clientY)) < 4
      )
        return
      active.moved = true
      const next = candidateAt(
        isSmall(active.item)
          ? (props.draft ?? active.item)
          : {
              ...active.item,
              rotation: props.draft?.rotation ?? active.item.rotation,
            },
        e.clientX,
        e.clientY,
        active.offset,
      )
      if (!next) return
      active.draft = next
      props.onDraft(next)
    }
    const up = (e: PointerEvent) => {
      const active = drag.current
      if (!active || active.pointer !== e.pointerId) return
      if (active.token !== current.current.cancelToken) {
        cancel()
        return
      }
      const candidate = {
        ...active.draft,
        rotation: current.current.draft?.rotation ?? active.draft.rotation,
      }
      const error = validatePlacement(candidate, current.current.items)
      if (error)
        current.current.onMessage(error + ' — предмет возвращён на место')
      else {
        current.current.onCommit(candidate)
        if (active.moved) current.current.onMessage('Предмет размещён')
      }
      cancel()
    }
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') cancel()
    }
    // Capture before R3F raycasting: selected rugs remain placeable under furniture.
    const place = (e: PointerEvent) => {
      const props = current.current
      if (!props.placing || e.button !== 0) return
      e.stopImmediatePropagation()
      e.preventDefault()
      const item = props.items.find((i) => i.id === props.selected)
      if (!item) return
      const candidate = candidateAt(props.draft ?? item, e.clientX, e.clientY)
      if (!candidate) return
      const error = validatePlacement(candidate, props.items)
      props.onDraft(candidate)
      if (error) {
        props.onMessage(error)
        return
      }
      props.onCommit(candidate)
      props.onMessage('Предмет размещён')
      cancel()
    }
    gl.domElement.addEventListener('pointerdown', place, true)
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
      gl.domElement.removeEventListener('pointerdown', place, true)
    }
  }, [camera, gl, raycaster])
  useEffect(() => {
    cancelGesture.current()
  }, [p.cancelToken])
  function down(e: ThreeEvent<PointerEvent>, shown: Item) {
    if (e.button !== 0) return
    if (p.placing) return
    e.stopPropagation()
    const item = p.items.find((i) => i.id === shown.id)!
    p.onSelect(item.id)
    if (p.mode === 'interact') {
      if (isSmall(item)) p.onTake(item.id)
      else if (item.kind === 'lamp') p.onInteract(item.id, { kind: 'lamp' })
      else
        p.onMessage(
          item.kind === 'cabinet'
            ? 'Нажмите на нужный ящик или используйте кнопки'
            : 'Для переноса включите режим «Перемещение»',
        )
      return
    }
    const world = worldPose(item, p.items)
    const hit = pointAt(e.clientX, e.clientY, world.y)
    if (!hit) return
    p.onSelect(item.id)
    drag.current = {
      item,
      offset: hit.sub(new Vector3(world.x, world.y, world.z)),
      pointer: e.pointerId,
      draft: item,
      screen: new Vector2(e.clientX, e.clientY),
      moved: false,
      token: p.cancelToken,
    }
    gl.domElement.setPointerCapture(e.pointerId)
    document.body.style.cursor = 'grabbing'
    if (controls.current) controls.current.enabled = false
    p.onDraft(item)
  }
  return (
    <>
      <ambientLight intensity={0.45} />
      <hemisphereLight args={['#fff0d9', '#6c8066', 0.9]} />
      <directionalLight
        position={[-3, 10, 4]}
        intensity={2.6}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.04}
      />
      <House walls={p.walls} />
      {/** Children resolve against the preview parent so attachments move atomically. */}
      {p.items.map((item) => {
        const shown = p.draft?.id === item.id ? p.draft : item
        const shownItems = p.draft
          ? p.items.map((i) => (i.id === p.draft!.id ? p.draft! : i))
          : p.items
        return (
          <Furniture
            key={item.id}
            item={worldPose(shown, shownItems)}
            selected={p.selected === item.id}
            invalid={!!validatePlacement(shown, p.items)}
            onDown={down}
            mode={p.mode}
            transporting={p.draft?.id === item.id}
            onInteract={(action) => {
              p.onSelect(item.id)
              p.onInteract(item.id, action)
            }}
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
        if (e.button === 0 && !p.draft && !p.placing) p.onSelect(null)
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
