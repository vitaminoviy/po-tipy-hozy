import { VisualMaterials } from './visualMaterials'
import FloorScene from './FloorScene'
import { floorMaterials, type FloorState, type FloorMaterial } from './flooring'
import type { Room } from './cleaning'
import {
  useEffect,
  useRef,
  useState,
  type ComponentRef,
  type ReactNode,
  type MutableRefObject,
} from 'react'
import { Canvas, useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import { OrbitControls } from '@react-three/drei'
import { PCFShadowMap, MOUSE, Plane, Vector2, Vector3, Group } from 'three'
import House from './House'
import WorkTools, { type WorkTool } from './WorkTools'
import { supportHeight, FLOOR_TOP } from './grounding'
import Furniture from './Furniture'
import Cleaning from './TrashScene'
import DirtScene from './DirtScene'
import PaintScene from './PaintScene'
import type { PaintState, PaintColor } from './painting'
import type { DirtState } from './wiping'
import type { Trash, Disposal } from './cleaning'
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
  floors: FloorState[]
  cancelFloor: MutableRefObject<() => void>
  onFloorBegin: () => void
  onFloorCommit: (
    room: Room,
    material: FloorMaterial,
    laid: Uint8Array,
    visible: Float32Array,
  ) => void
  onFloorConflict: (room: Room, material: FloorMaterial) => void
  tool: WorkTool
  natural: boolean
  selectedTrash: boolean
  cancelWipe: MutableRefObject<() => void>
  onTool: (t: WorkTool) => void
  onColor: (c: PaintColor) => void
  paint: PaintState[]
  paintTool: boolean
  paintColor: PaintColor
  cancelPaint: MutableRefObject<() => void>
  onPaintBegin: () => void
  onPaintCommit: (id: string, color: PaintColor, mask: Uint8Array) => void
  onPaintProgress: (id: string, fraction: number) => void
  dirt: DirtState[]
  onWipeBegin: () => void
  onWipeCommit: (id: string, mask: Uint8Array) => void
  onWipeProgress: (id: string, fraction: number) => void
  items: Item[]
  selected: string | null
  draft: Item | null
  getDraft: () => Item | null
  onMove: (update: () => Item | null) => void
  flushMove: () => void
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
  trash: Trash[]
  disposal: Disposal | null
  binFeedback: { id: string; at: number } | null
  onTrashPick: (id: string) => void
  onBin: (id: string) => void
  onQuickClean: (id: string) => void
  onDisposalComplete: (pending: Disposal) => void
}
function Interior(p: Props) {
  const { camera, gl, raycaster, size, scene } = useThree()
  const portrait = size.width / size.height < 0.75
  const fitZoom =
    Math.min(
      size.width / (portrait ? 11.8 : 12.3),
      size.height / (portrait ? 13.5 : 10.3),
    ) * 0.9
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
  const wiping = useRef(false)
  const painting = useRef(false)
  const laying = useRef(false)
  const [quickHeld, setQuickHeld] = useState(false)
  useEffect(() => {
    if (!p.disposal) delete gl.domElement.dataset.flight
  }, [p.disposal, gl])
  const cameraVelocity = useRef(new Vector3())
  const drawerMotion = useRef(
    new Map(
      p.items.flatMap((item) =>
        drawerSpecs(item).map(
          (_, index) =>
            [
              `${item.id}:${index}`,
              item.drawers?.[index] ? DRAWER_TRAVEL : 0,
            ] as [string, number],
        ),
      ),
    ),
  )
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
    if (drag.current || wiping.current || painting.current || laying.current) {
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
    orbit.enabled =
      !drag.current && !wiping.current && !painting.current && !laying.current
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
    camera.position.set(
      ...((portrait ? [15, 18, 4] : [12, 11, 15]) as [number, number, number]),
    )
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
    const moveNow = (
      e: Pick<PointerEvent, 'clientX' | 'clientY' | 'buttons' | 'pointerId'>,
    ): Item | null => {
      const active = drag.current,
        props = current.current
      if (!active) {
        if (!props.placing || e.buttons !== 0) return null
        const item = props.items.find((i) => i.id === props.selected)
        if (!item) return null
        const rect = gl.domElement.getBoundingClientRect()
        if (
          e.clientX < rect.left ||
          e.clientX > rect.right ||
          e.clientY < rect.top ||
          e.clientY > rect.bottom
        )
          return null
        const candidate = candidateAt(
          props.getDraft() ?? item,
          e.clientX,
          e.clientY,
        )
        return candidate
      }
      if (active.pointer !== e.pointerId) return null
      if (active.token !== props.cancelToken) {
        cancel()
        return null
      }
      if (
        !active.moved &&
        active.screen.distanceTo(new Vector2(e.clientX, e.clientY)) < 4
      )
        return null
      active.moved = true
      const next = candidateAt(
        isSmall(active.item)
          ? (props.getDraft() ?? active.item)
          : {
              ...active.item,
              rotation: props.getDraft()?.rotation ?? active.item.rotation,
            },
        e.clientX,
        e.clientY,
        active.offset,
      )
      if (!next) return null
      active.draft = next
      return next
    }
    const move = (e: PointerEvent) => {
      const props = current.current
      if (
        drag.current
          ? drag.current.pointer !== e.pointerId
          : !props.placing || e.buttons !== 0
      )
        return
      const sample = {
        clientX: e.clientX,
        clientY: e.clientY,
        buttons: e.buttons,
        pointerId: e.pointerId,
      }
      // Only the latest sample is useful for the next displayed pose. The shared
      // App RAF combines it with rotation before validation and React publication.
      props.onMove(() => moveNow(sample))
    }
    const up = (e: PointerEvent) => {
      const active = drag.current
      if (!active || active.pointer !== e.pointerId) return
      if (active.token !== current.current.cancelToken) {
        cancel()
        return
      }
      current.current.flushMove()
      const candidate = {
        ...(current.current.getDraft() ?? active.draft),
      }
      if (active.moved || candidate.rotation !== active.item.rotation)
        current.current.onDrop(candidate)
      const props = current.current
      if (
        props.natural &&
        !active.moved &&
        candidate.rotation === active.item.rotation &&
        active.item.kind === 'lamp'
      )
        props.onInteract(active.item.id, { kind: 'lamp' })
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
        if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
          setQuickHeld(true)
        e.preventDefault()
      }
      if (e.code === 'Home') {
        resetView.current()
        e.preventDefault()
      }
      if (e.code === 'Enter' && current.current.getDraft()) {
        current.current.flushMove()
        const candidate = current.current.getDraft()!
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
    const release = (e: KeyboardEvent) => {
      keys.current.delete(e.code)
      if (e.code === 'ShiftLeft' || e.code === 'ShiftRight')
        setQuickHeld(
          keys.current.has('ShiftLeft') || keys.current.has('ShiftRight'),
        )
    }
    const blur = () => {
      keys.current.clear()
      setQuickHeld(false)
      cameraVelocity.current.set(0, 0, 0)
      cancel()
    }
    // Capture before R3F raycasting: selected rugs remain placeable under furniture.
    const place = (e: PointerEvent) => {
      const props = current.current
      if (e.button === 0 && e.shiftKey && props.disposal) {
        e.stopImmediatePropagation()
        e.preventDefault()
        props.onMessage('Дождитесь окончания полёта; Esc — отменить')
        return
      }
      if (!props.placing || e.button !== 0 || e.buttons !== 1) return
      e.stopImmediatePropagation()
      e.preventDefault()
      pointAt(e.clientX, e.clientY)
      if (
        raycaster
          .intersectObjects(scene.children, true)
          .some(
            (hit) =>
              hit.object.userData.cleaningTarget === 'bin' &&
              hit.object.userData.id !== props.selected,
          )
      ) {
        props.onMessage(
          'Ведро принимает только мусор. Для предмета выберите другое место.',
        )
        return
      }
      const item = props.items.find((i) => i.id === props.selected)
      if (!item) return
      const candidate = candidateAt(
        props.getDraft() ?? item,
        e.clientX,
        e.clientY,
      )
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
  }, [camera, gl, raycaster, fitZoom, scene])
  useEffect(() => {
    cancelGesture.current()
  }, [p.cancelToken])
  function down(e: ThreeEvent<PointerEvent>, shown: Item) {
    if (e.button !== 0 || e.buttons !== 1) return
    if (p.placing) return
    if (p.natural && p.tool) {
      e.stopPropagation()
      return
    }
    e.stopPropagation()
    const item = p.items.find((i) => i.id === shown.id)!
    if (p.disposal?.binId === item.id) {
      p.onMessage(
        'Ведро принимает мусор — дождитесь завершения или нажмите Esc',
      )
      return
    }
    if (
      item.kind === 'bin' &&
      (p.natural ? p.selectedTrash : p.mode === 'interact')
    ) {
      p.onBin(item.id)
      return
    }
    p.onSelect(item.id)
    if (!p.natural && p.mode === 'interact') {
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
  const shownItems = p.draft
    ? p.items.map((i) =>
        i.id === p.draft!.id
          ? {
              ...p.draft!,
              drawers: [false, false, false] as [boolean, boolean, boolean],
            }
          : i,
      )
    : p.items
  return (
    <>
      <ambientLight intensity={0.55} />
      <hemisphereLight args={['#edf3ff', '#c7b498', 1.05]} />
      <directionalLight
        position={[-3, 9, -6]}
        intensity={2.3}
        color="#fff0d8"
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-camera-left={-9}
        shadow-camera-right={9}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
        shadow-normalBias={0.025}
        shadow-radius={3}
      />
      <House walls={p.walls} />
      <WorkTools
        tool={p.tool}
        color={p.paintColor}
        onTool={p.onTool}
        onColor={p.onColor}
        onHint={p.onMessage}
      />
      <FloorScene
        walls={p.walls}
        occlusionKey={p.trash.map((t) => t.state).join(',')}
        floors={p.floors}
        items={p.items}
        material={
          p.tool && p.tool in floorMaterials ? (p.tool as FloorMaterial) : null
        }
        enabled={
          !!p.tool &&
          p.tool in floorMaterials &&
          !p.draft &&
          !p.placing &&
          !p.disposal
        }
        active={laying}
        cancelRef={p.cancelFloor}
        cancelToken={p.cancelToken}
        onBegin={p.onFloorBegin}
        onCommit={p.onFloorCommit}
        onConflict={p.onFloorConflict}
      />
      <PaintScene
        paint={p.paint}
        enabled={
          p.paintTool &&
          (p.natural || p.mode === 'interact') &&
          !p.draft &&
          !p.placing &&
          !p.disposal
        }
        visible={p.walls}
        color={p.paintColor}
        cancelToken={p.cancelToken}
        active={painting}
        cancelRef={p.cancelPaint}
        onBegin={p.onPaintBegin}
        onCommit={p.onPaintCommit}
        onProgress={p.onPaintProgress}
        onHint={p.onMessage}
      />
      <DirtScene
        cancelRef={p.cancelWipe}
        dirt={p.dirt}
        enabled={
          (p.natural ? p.tool === 'sponge' : p.mode === 'interact') &&
          !p.paintTool &&
          !(p.tool && p.tool in floorMaterials) &&
          !p.draft &&
          !p.placing &&
          !p.disposal
        }
        cancelToken={p.cancelToken}
        active={wiping}
        onBegin={p.onWipeBegin}
        onCommit={p.onWipeCommit}
        onProgress={p.onWipeProgress}
      />
      <Cleaning
        trash={p.trash}
        items={p.items}
        pending={p.disposal}
        enabled={
          (p.natural ? !p.tool : p.mode === 'interact') &&
          !p.draft &&
          !p.placing
        }
        onPick={p.onTrashPick}
        quickEnabled={quickHeld && !p.draft && !p.placing}
        onQuick={p.onQuickClean}
        onComplete={p.onDisposalComplete}
        onHint={p.onMessage}
      />
      {/** Children resolve against the preview parent so attachments move atomically. */}
      {p.items.map((item) => {
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
              invalid={
                p.selected === item.id && !!validatePlacement(shown, p.items)
              }
              onDown={down}
              mode={p.natural ? 'interact' : p.mode}
              drawerMotion={drawerMotion.current}
              surfaceY={supportHeight(shown, shownItems)}
              binActive={p.disposal?.binId === item.id}
              binFeedbackAt={
                p.binFeedback?.id === item.id ? p.binFeedback.at : undefined
              }
              onInteract={(action) => {
                if (p.natural && p.tool) return
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
        maxZoom={Math.max(95, fitZoom * 2.1)}
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
      shadows={{ type: PCFShadowMap }}
      dpr={[1, 1.75]}
      camera={{ position: [12, 11, 15], zoom: 46, near: 0.1, far: 250 }}
      onPointerMissed={(e) => {
        if (e.button === 0 && !p.draft && !p.placing && !p.disposal)
          p.onSelect(null)
      }}
      onContextMenu={(e) => e.preventDefault()}
      fallback={
        <div className="fallback">Для 3D-сцены нужен браузер с WebGL.</div>
      }
    >
      <VisualMaterials>
        <Interior {...p} />
      </VisualMaterials>
    </Canvas>
  )
}
