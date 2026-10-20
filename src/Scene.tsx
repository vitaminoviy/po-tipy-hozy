import { useEffect, useRef, type ComponentRef, type ReactNode } from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { MOUSE, Plane, Vector2, Vector3, Group } from 'three'
import House from './House'
import { supportHeight, FLOOR_TOP } from './grounding'
import Furniture from './Furniture'
import {
  placementCandidate,
  validatePlacement,
  worldPose,
  surfaceLocal,
  isSmall,
  drawerSpecs,
  support,
  surfaceAnchors,
  DRAWER_TRAVEL,
  type Item,
} from './placement'
import type { Mode, Interaction } from './history'
import { approach } from './history'
import {
  isEditing,
  movement,
  smoothAxis,
  CAMERA_SPEED,
  CAMERA_FAST_SPEED,
  CAMERA_MIN_POLAR,
  CAMERA_MAX_POLAR,
} from './controls'

// Drawer mesh and contents read a single animation value. Closing hides meshes
// and picking targets; attachment records stay in the history unchanged.
function StoredContents({
  item,
  parent,
  children,
  transporting,
  motion,
}: {
  item: Item
  parent?: Item
  children: ReactNode
  transporting: boolean
  motion: Map<string, number>
}) {
  const target =
    parent &&
    item.drawerIndex !== undefined &&
    parent.drawers?.[item.drawerIndex] &&
    !transporting
      ? DRAWER_TRAVEL
      : 0
  const group = useRef<Group>(null)
  useFrame(() => {
    if (!group.current) return
    const angle = ((parent?.rotation ?? 0) * Math.PI) / 2
    const offset =
      item.drawerIndex === undefined
        ? 0
        : (motion.get(`${parent?.id}:${item.drawerIndex}`) ?? 0) - target
    group.current.position.set(
      Math.sin(angle) * offset,
      0,
      Math.cos(angle) * offset,
    )
  })
  return (
    <group ref={group}>
      {item.drawerIndex === undefined || target > 0 ? children : null}
    </group>
  )
}

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
  onDrop: (item: Item) => void
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
  const keys = useRef(new Set<string>())
  const cameraVelocity = useRef(new Vector3())
  const drawerMotion = useRef(new Map<string, number>())
  useFrame((_, delta) => {
    const dt = Math.min(delta, 0.05),
      props = current.current,
      orbit = controls.current
    for (const parent of props.items) {
      drawerSpecs(parent).forEach((_, index) => {
        const key = `${parent.id}:${index}`
        const target =
          props.draft?.id !== parent.id && parent.drawers?.[index]
            ? DRAWER_TRAVEL
            : 0
        drawerMotion.current.set(
          key,
          approach(drawerMotion.current.get(key) ?? 0, target, dt, 12),
        )
      })
    }
    if (!orbit) return
    if (isEditing(document.activeElement)) keys.current.clear()
    const forward = camera.getWorldDirection(new Vector3()).setY(0).normalize()
    const direction = movement(keys.current, forward)
    const fast = keys.current.has('ShiftLeft') || keys.current.has('ShiftRight')
    // Only a held left-button drag pauses keyboard camera travel. A selected
    // item or click-to-place preview never takes ownership of WASD.
    if (drag.current) {
      cameraVelocity.current.set(0, 0, 0)
    } else {
      const desired = new Vector3(direction.x, 0, direction.z).multiplyScalar(
        fast ? CAMERA_FAST_SPEED : CAMERA_SPEED,
      )
      const x = smoothAxis(cameraVelocity.current.x, desired.x, dt),
        z = smoothAxis(cameraVelocity.current.z, desired.z, dt)
      cameraVelocity.current.set(x.velocity, 0, z.velocity)
      const shift = new Vector3(x.distance, 0, z.distance)
      camera.position.add(shift)
      orbit.target.add(shift)
    }
    orbit.update()
    // Clamp after damping as well: residual mouse pan must not escape bounds.
    const bounded = orbit.target
      .clone()
      .clamp(new Vector3(-4, 0, -3), new Vector3(4, 0, 3))
    camera.position.add(bounded.clone().sub(orbit.target))
    orbit.target.copy(bounded)
    gl.domElement.dataset.camera = JSON.stringify({
      position: camera.position.toArray(),
      target: orbit.target.toArray(),
      zoom: camera.zoom,
    })
  })
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
    const floor = pointAt(x, y, isSmall(item) ? FLOOR_TOP : 0)
    if (!isSmall(item))
      return floor
        ? placementCandidate(item, floor.x - offset.x, floor.z - offset.z)
        : null
    const orientation = worldPose(item, props.items).rotation
    let nearest: { item: Item; distance: number } | null = null
    for (const parent of props.items) {
      for (const anchor of surfaceAnchors(parent)) {
        const { drawerIndex } = anchor
        const surface = support({ ...item, ...anchor }, parent)
        if (!surface || !surface.open) continue
        if (drawerIndex !== undefined)
          surface.center =
            drawerSpecs(parent)[drawerIndex].center +
            (drawerMotion.current.get(`${parent.id}:${drawerIndex}`) ?? 0)
        const hit = raycaster.ray.intersectPlane(
          new Plane(new Vector3(0, 1, 0), -surface.height),
          new Vector3(),
        )
        if (!hit) continue
        const underCursor = surfaceLocal(parent, hit.x, hit.z)
        underCursor.x -= surface.centerX
        underCursor.z -= surface.center
        const reach = drawerIndex === undefined ? 0 : 0.14
        if (
          Math.abs(underCursor.x) > surface.size[0] / 2 + reach ||
          Math.abs(underCursor.z) > surface.size[1] / 2 + reach
        )
          continue
        const local = surfaceLocal(parent, hit.x - offset.x, hit.z - offset.z),
          distance = hit.distanceToSquared(raycaster.ray.origin)
        local.x -= surface.centerX
        local.z -= surface.center
        if (!nearest || distance < nearest.distance)
          nearest = {
            item: {
              ...item,
              ...local,
              surfaceId: parent.id,
              ...anchor,
              rotation: (orientation - parent.rotation + 4) % 4,
            },
            distance,
          }
      }
    }
    return (
      nearest?.item ??
      (floor
        ? placementCandidate(
            {
              ...item,
              surfaceId: undefined,
              surfaceZone: undefined,
              drawerIndex: undefined,
              rotation: orientation,
            },
            floor.x - offset.x,
            floor.z - offset.z,
          )
        : null)
    )
  }
  const cancelGesture = useRef(() => {})
  const resetView = useRef(() => {})
  resetView.current = () => {
    const orbit = controls.current
    if (orbit) {
      orbit.enableDamping = false
      orbit.reset()
    }
    camera.position.set(12, 11, 15)
    camera.zoom = fitZoom
    camera.updateProjectionMatrix()
    cameraVelocity.current.set(0, 0, 0)
    if (orbit) {
      orbit.target.set(0, 0, 0)
      orbit.update()
      orbit.enableDamping = true
    }
  }
  useEffect(() => {
    resetView.current()
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
      if (active.moved) current.current.onDrop(candidate)
      cancel()
    }
    const key = (e: KeyboardEvent) => {
      if (isEditing(e.target) || e.ctrlKey || e.metaKey || e.altKey) return
      if (
        ['KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight'].includes(
          e.code,
        )
      ) {
        keys.current.add(e.code)
        e.preventDefault()
      }
      if (e.code === 'Home') {
        resetView.current()
        e.preventDefault()
      }
      if (e.code === 'Enter' && current.current.draft) {
        const candidate = current.current.draft
        const error = validatePlacement(candidate, current.current.items)
        if (error) current.current.onMessage(error)
        else {
          current.current.onCommit(candidate)
          cancel()
        }
        e.preventDefault()
      }
      if (e.key === 'Escape') cancel()
    }
    const release = (e: KeyboardEvent) => keys.current.delete(e.code)
    const blur = () => {
      keys.current.clear()
      cameraVelocity.current.set(0, 0, 0)
      cancel()
    }
    // Capture before R3F raycasting: selected rugs remain placeable under furniture.
    const place = (e: PointerEvent) => {
      const props = current.current
      if (!props.placing || e.button !== 0 || e.buttons !== 1) return
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
    window.addEventListener('blur', blur)
    window.addEventListener('keydown', key)
    window.addEventListener('keyup', release)
    return () => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', blur)
      window.removeEventListener('keydown', key)
      window.removeEventListener('keyup', release)
      gl.domElement.removeEventListener('pointerdown', place, true)
    }
  }, [camera, gl, raycaster, fitZoom])
  useEffect(() => {
    cancelGesture.current()
  }, [p.cancelToken])
  function down(e: ThreeEvent<PointerEvent>, shown: Item) {
    if (e.button !== 0 || e.buttons !== 1) return
    if (p.placing) return
    e.stopPropagation()
    const item = p.items.find((i) => i.id === shown.id)!
    p.onSelect(item.id)
    if (p.mode === 'interact') {
      if (isSmall(item)) p.onTake(item.id)
      else if (item.kind === 'lamp') p.onInteract(item.id, { kind: 'lamp' })
      else
        p.onMessage(
          drawerSpecs(item).length > 0
            ? 'Нажмите на нужный ящик или используйте кнопки'
            : 'Для переноса включите режим «Перемещение»',
        )
      return
    }
    const world = worldPose(item, p.items)
    if (item.drawerIndex !== undefined) {
      const parent = p.items.find((i) => i.id === item.surfaceId)!
      const offset =
        (drawerMotion.current.get(`${parent.id}:${item.drawerIndex}`) ?? 0) -
        DRAWER_TRAVEL
      const angle = (parent.rotation * Math.PI) / 2
      world.x += Math.sin(angle) * offset
      world.z += Math.cos(angle) * offset
    }
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
        const shownItems = p.draft
          ? p.items.map((i) =>
              i.id === p.draft!.id
                ? {
                    ...p.draft!,
                    drawers: [false, false, false] as [
                      boolean,
                      boolean,
                      boolean,
                    ],
                  }
                : i,
            )
          : p.items
        const shown = shownItems.find((i) => i.id === item.id)!
        const parent = shownItems.find((i) => i.id === shown.surfaceId)
        return (
          <StoredContents
            key={item.id}
            item={shown}
            parent={parent}
            transporting={p.draft?.id === parent?.id}
            motion={drawerMotion.current}
          >
            <Furniture
              key={item.id}
              item={worldPose(shown, shownItems)}
              selected={p.selected === item.id}
              invalid={!!validatePlacement(shown, p.items)}
              onDown={down}
              mode={p.mode}
              drawerMotion={drawerMotion.current}
              surfaceY={supportHeight(shown, shownItems)}
              onInteract={(action) => {
                p.onSelect(item.id)
                p.onInteract(item.id, action)
              }}
            />
          </StoredContents>
        )
      })}
      <OrbitControls
        ref={controls}
        makeDefault
        enableDamping
        minZoom={Math.min(25, fitZoom * 0.65)}
        maxZoom={95}
        minPolarAngle={CAMERA_MIN_POLAR}
        maxPolarAngle={CAMERA_MAX_POLAR}
        screenSpacePanning={false}
        mouseButtons={{
          LEFT: undefined,
          MIDDLE: MOUSE.ROTATE,
          RIGHT: MOUSE.PAN,
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
