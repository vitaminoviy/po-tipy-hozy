import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  CanvasTexture,
  Group,
  Mesh,
  MeshBasicMaterial,
  Plane,
  Raycaster,
  Vector2,
  Vector3,
} from 'three'
import { FLOOR_TOP } from './grounding'
import { isEditing } from './controls'
import {
  BRUSH_RADIUS,
  MASK_SIZE,
  cleanFraction,
  dirtPatches,
  isClean,
  wipeSegment,
  type BrushPoint,
  type DirtPatch,
  type DirtState,
} from './wiping'

const HEIGHT = FLOOR_TOP + 0.004
type Props = {
  cancelRef: MutableRefObject<() => void>
  dirt: DirtState[]
  enabled: boolean
  cancelToken: number
  active: MutableRefObject<boolean>
  onBegin: () => void
  onCommit: (id: string, mask: Uint8Array) => void
  onProgress: (id: string, fraction: number) => void
}
type View = { mask: Uint8Array; changed: boolean }
function Patch({
  patch,
  view,
  down,
}: {
  patch: DirtPatch
  view: View
  down: (e: ThreeEvent<PointerEvent>, patch: DirtPatch) => void
}) {
  const mesh = useRef<Mesh>(null)
  const material = useRef<MeshBasicMaterial>(null)
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = canvas.height = MASK_SIZE
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(MASK_SIZE, MASK_SIZE)
    const texture = new CanvasTexture(canvas)
    return { canvas, context, pixels, texture }
  }, [])
  const lastMask = useRef<Uint8Array | null>(null)
  const faded = useRef(false)
  useEffect(() => () => resources.texture.dispose(), [resources])
  useFrame((_, dt) => {
    const m = material.current!
    const clean = isClean(view.mask)
    if (clean && lastMask.current && !faded.current) {
      m.opacity = Math.max(0, m.opacity - dt / 0.25)
      if (m.opacity > 0) return
      faded.current = true
    }
    if (!clean) {
      faded.current = false
      m.opacity = 1
    }
    if (lastMask.current === view.mask && !view.changed) return
    const { context, pixels, texture } = resources
    for (let i = 0; i < view.mask.length; i++) {
      pixels.data[i * 4] = 83
      pixels.data[i * 4 + 1] = 68
      pixels.data[i * 4 + 2] = 48
      pixels.data[i * 4 + 3] = view.mask[i]
    }
    context.putImageData(pixels, 0, 0)
    texture.needsUpdate = true
    view.changed = false
    lastMask.current = view.mask
    mesh.current!.visible = !clean || m.opacity > 0
  })
  return (
    <mesh
      ref={mesh}
      position={[patch.x, HEIGHT, patch.z]}
      rotation={[-Math.PI / 2, 0, 0]}
      userData={{ dirt: patch.id }}
      onPointerDown={(e) => down(e, patch)}
    >
      <planeGeometry args={[patch.w, patch.d]} />
      <meshBasicMaterial
        ref={material}
        map={resources.texture}
        transparent
        depthWrite={false}
      />
    </mesh>
  )
}

export default function DirtScene(p: Props) {
  const { camera, gl, scene } = useThree()
  const current = useRef(p)
  current.current = p
  const views = useMemo(
    () =>
      new Map(
        dirtPatches.map((patch) => [
          patch.id,
          { mask: p.dirt.find((d) => d.id === patch.id)!.mask, changed: true },
        ]),
      ),
    [],
  )
  const gesture = useRef<{
    patch: DirtPatch
    mask: Uint8Array
    last: BrushPoint | null
    pointer: number
    changed: boolean
  } | null>(null)
  const sponge = useRef<Group>(null)
  const ray = useMemo(() => new Raycaster(), [])
  const uv = useMemo(() => new Vector2(), [])
  const plane = useMemo(() => new Plane(new Vector3(0, 1, 0), -HEIGHT), [])
  const hit = useMemo(() => new Vector3(), [])
  const finishRef = useRef<(commit: boolean) => void>(() => {})
  // Renderer consumes session data, but never owns committed masks.
  useEffect(() => {
    for (const d of p.dirt) {
      if (gesture.current?.patch.id === d.id) continue
      const view = views.get(d.id)!
      view.mask = d.mask
      view.changed = true
    }
  }, [p.dirt, views])
  useEffect(() => {
    finishRef.current(false)
  }, [p.enabled, p.cancelToken])
  useEffect(() => {
    const finish = (commit: boolean) => {
      const g = gesture.current
      if (!g) return
      gesture.current = null
      current.current.active.current = false
      if (sponge.current) sponge.current.visible = false
      if (gl.domElement.hasPointerCapture(g.pointer))
        gl.domElement.releasePointerCapture(g.pointer)
      const view = views.get(g.patch.id)!
      if (commit && g.changed) {
        if (isClean(g.mask)) g.mask.fill(0)
        view.mask = g.mask
        current.current.onCommit(g.patch.id, g.mask)
      } else
        view.mask = current.current.dirt.find((d) => d.id === g.patch.id)!.mask
      view.changed = true
      current.current.onProgress(g.patch.id, cleanFraction(view.mask))
    }
    finishRef.current = finish
    p.cancelRef.current = () => finish(false)
    const move = (e: PointerEvent) => {
      const g = gesture.current
      if (!g || e.pointerId !== g.pointer) return
      if (!(e.buttons & 1)) {
        finish(true)
        return
      }
      const b = gl.domElement.getBoundingClientRect()
      uv.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        1 - ((e.clientY - b.top) / b.height) * 2,
      )
      ray.setFromCamera(uv, camera)
      // Respect furniture/rug occlusion, and break a stroke when it leaves the patch.
      const first = ray
        .intersectObjects(scene.children, true)
        .find(
          (h) =>
            h.object.visible &&
            h.object !== sponge.current &&
            !h.object.userData.wipeTool,
        )
      const onPatch = first?.object.userData.dirt === g.patch.id
      const exitingToFloor =
        !!g.last &&
        !!first &&
        first.point.y <= FLOOR_TOP + 0.006 &&
        first.point.y >= -0.03
      if (
        (!onPatch && !exitingToFloor) ||
        !ray.ray.intersectPlane(plane, hit)
      ) {
        g.last = null
        sponge.current!.visible = false
        return
      }
      const next = { x: hit.x - g.patch.x, z: hit.z - g.patch.z }
      if (g.last && wipeSegment(g.mask, g.patch, g.last, next)) {
        g.changed = true
        views.get(g.patch.id)!.changed = true
        current.current.onProgress(g.patch.id, cleanFraction(g.mask))
      }
      g.last = onPatch ? next : null
      sponge.current!.visible = onPatch
      sponge.current!.position.set(hit.x, HEIGHT + 0.018, hit.z)
    }
    const up = (e: PointerEvent) => {
      if (e.pointerId === gesture.current?.pointer) finish(true)
    }
    const cancel = () => finish(false)
    const key = (e: KeyboardEvent) => {
      if (!gesture.current || isEditing(e.target)) return
      if (
        e.key === 'Escape' ||
        e.code === 'Tab' ||
        ((e.ctrlKey || e.metaKey) && ['KeyZ', 'KeyY'].includes(e.code))
      )
        finish(false)
      else if (['KeyE', 'KeyQ', 'KeyR'].includes(e.code)) {
        e.preventDefault()
        e.stopImmediatePropagation()
      }
    }
    const otherButton = (e: PointerEvent) => {
      if (e.button !== 0) finish(false)
    }
    const hidden = () => {
      if (document.hidden) finish(false)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', otherButton, true)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      cancel()
      p.cancelRef.current = () => {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', otherButton, true)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [camera, gl, scene, views, ray, uv, plane, hit])
  function down(e: ThreeEvent<PointerEvent>, patch: DirtPatch) {
    if (
      !p.enabled ||
      e.button !== 0 ||
      e.shiftKey ||
      gesture.current ||
      isClean(views.get(patch.id)!.mask)
    )
      return
    e.stopPropagation()
    p.onBegin()
    const mask = views.get(patch.id)!.mask.slice()
    views.get(patch.id)!.mask = mask
    gesture.current = {
      patch,
      mask,
      last: { x: e.point.x - patch.x, z: e.point.z - patch.z },
      pointer: e.pointerId,
      changed: false,
    }
    p.active.current = true
    gl.domElement.setPointerCapture(e.pointerId)
    sponge.current!.visible = true
    sponge.current!.position.set(e.point.x, HEIGHT + 0.018, e.point.z)
    p.onProgress(patch.id, cleanFraction(mask))
  }
  return (
    <>
      {dirtPatches.map((patch) => (
        <Patch
          key={patch.id}
          patch={patch}
          view={views.get(patch.id)!}
          down={down}
        />
      ))}
      <group ref={sponge} visible={false}>
        <mesh userData={{ wipeTool: true }} raycast={() => {}}>
          <boxGeometry
            args={[BRUSH_RADIUS * 1.25, 0.03, BRUSH_RADIUS * 0.85]}
          />
          <meshStandardMaterial color="#c9c3a0" roughness={1} />
        </mesh>
      </group>
    </>
  )
}
