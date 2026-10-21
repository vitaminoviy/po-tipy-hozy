import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  InstancedMesh,
  Object3D,
  Color,
  Raycaster,
  Vector2,
  Vector3,
  Mesh,
} from 'three'
import { FLOOR_TOP } from './grounding'
import { isEditing } from './controls'
import {
  floorCells,
  floorRoom,
  floorMaterials,
  floorProgress,
  laySegment,
  type FloorState,
  type FloorMaterial,
} from './flooring'
import type { Room } from './cleaning'
import type { Item } from './placement'
import type { Point } from './planarGeometry'
type View = { material: FloorMaterial | null; laid: Uint8Array; dirty: boolean }
type Props = {
  floors: FloorState[]
  items: Item[]
  material: FloorMaterial | null
  walls: boolean
  occlusionKey: string
  enabled: boolean
  active: MutableRefObject<boolean>
  cancelRef: MutableRefObject<() => void>
  cancelToken: number
  onBegin: () => void
  onCommit: (
    room: Room,
    material: FloorMaterial,
    laid: Uint8Array,
    visible: Float32Array,
  ) => void
  onConflict: (room: Room, material: FloorMaterial) => void
}
function FloorLayer({ room, view }: { room: Room; view: View }) {
  const base = useRef<InstancedMesh>(null),
    panels = useRef<InstancedMesh>(null)
  const dummy = useMemo(() => new Object3D(), []),
    color = useMemo(() => new Color(), [])
  useFrame(() => {
    if (!view.dirty) return
    view.dirty = false
    const material = view.material,
      cells = material ? floorCells(room, material) : []
    const palette = material ? floorMaterials[material] : floorMaterials.oak
    base.current!.count = panels.current!.count = cells.length
    for (let i = 0; i < cells.length; i++) {
      const c = cells[i],
        shown = !!c && !!view.laid[i]
      for (const [mesh, inset, y] of [
        [base.current!, 0, FLOOR_TOP + 0.0006],
        [
          panels.current!,
          material === 'tile' ? 0.012 : 0.006,
          FLOOR_TOP + 0.0014,
        ],
      ] as const) {
        dummy.position.set(c?.x ?? 0, y, c?.z ?? 0)
        dummy.scale.set(
          shown ? Math.max(0.001, c.w - inset) : 0,
          0.0004,
          shown ? Math.max(0.001, c.d - inset) : 0,
        )
        dummy.updateMatrix()
        mesh.setMatrixAt(i, dummy.matrix)
      }
      panels.current!.setColorAt(i, color.set(palette.colors[i % 3]))
      base.current!.setColorAt(i, color.set(palette.seam))
    }
    for (const mesh of [base.current!, panels.current!]) {
      mesh.instanceMatrix.needsUpdate = true
      if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true
    }
  })
  return (
    <>
      {[base, panels].map((ref, i) => (
        <instancedMesh
          key={i}
          ref={ref}
          args={[undefined, undefined, 300]}
          frustumCulled={false}
          raycast={() => {}}
          receiveShadow
          userData={{ floorVisual: room }}
        >
          <boxGeometry args={[1, 1, 1]} />
          <meshStandardMaterial roughness={1} />
        </instancedMesh>
      ))}
    </>
  )
}
export default function FloorScene(p: Props) {
  const { gl, camera, scene } = useThree(),
    current = useRef(p)
  current.current = p
  const views = useMemo(
    () =>
      new Map(
        p.floors.map((f) => [
          f.room,
          { material: f.material, laid: f.laid, dirty: true } as View,
        ]),
      ),
    [],
  )
  const gesture = useRef<{
    room: Room
    material: FloorMaterial
    laid: Uint8Array
    last: Point | null
    pointer: number
    changed: boolean
    visible: Float32Array
  } | null>(null)
  useEffect(() => {
    gl.domElement.dataset.flooring = JSON.stringify(
      p.floors.map((f) => ({
        room: f.room,
        material: f.material,
        laid: Array.from(f.laid).filter(Boolean).length,
        progress: floorProgress(f),
        complete: f.complete,
      })),
    )
  }, [gl, p.floors])
  const finishRef = useRef<(commit: boolean) => void>(() => {})
  const ray = useMemo(() => new Raycaster(), []),
    uv = useMemo(() => new Vector2(), [])
  useEffect(() => {
    for (const f of p.floors)
      if (gesture.current?.room !== f.room) {
        const v = views.get(f.room)!
        if (v.material !== f.material || v.laid !== f.laid)
          Object.assign(v, { material: f.material, laid: f.laid, dirty: true })
      }
  }, [p.floors, views])
  useEffect(() => {
    finishRef.current(false)
  }, [p.enabled, p.material, p.cancelToken])
  useEffect(() => {
    const finish = (commit: boolean) => {
      const g = gesture.current
      if (!g) return
      gesture.current = null
      current.current.active.current = false
      if (gl.domElement.hasPointerCapture(g.pointer))
        gl.domElement.releasePointerCapture(g.pointer)
      if (commit && g.changed)
        current.current.onCommit(g.room, g.material, g.laid, g.visible)
      else {
        const before = current.current.floors.find((f) => f.room === g.room)!
        Object.assign(views.get(g.room)!, {
          material: before.material,
          laid: before.laid,
          dirty: true,
        })
      }
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
      if (
        e.clientX < b.left ||
        e.clientX > b.right ||
        e.clientY < b.top ||
        e.clientY > b.bottom
      ) {
        g.last = null
        return
      }
      uv.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        1 - ((e.clientY - b.top) / b.height) * 2,
      )
      ray.setFromCamera(uv, camera)
      const first = ray
        .intersectObjects(scene.children, true)
        .find((h) => h.object.visible && !h.object.userData.floorVisual)
      if (
        !first ||
        first.point.y > FLOOR_TOP + 0.006 ||
        first.point.y < FLOOR_TOP - 0.005
      ) {
        g.last = null
        return
      }
      const next = { x: first.point.x, z: first.point.z }
      if (floorRoom(next) !== g.room) {
        g.last = null
        return
      }
      if (g.last && laySegment(g.laid, g.room, g.material, g.last, next)) {
        g.changed = true
        views.get(g.room)!.dirty = true
      }
      g.last = next
    }
    const up = (e: PointerEvent) => {
        if (e.pointerId === gesture.current?.pointer) finish(true)
      },
      cancel = () => finish(false)
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
    const button = (e: PointerEvent) => {
        if (e.button !== 0) cancel()
      },
      hidden = () => {
        if (document.hidden) cancel()
      }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
    window.addEventListener('pointercancel', cancel)
    window.addEventListener('blur', cancel)
    window.addEventListener('keydown', key, true)
    window.addEventListener('pointerdown', button, true)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      cancel()
      p.cancelRef.current = () => {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', button, true)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [gl, camera, scene, ray, uv, views])
  const visibilityCache = useRef<{
    key: string
    items: Item[]
    weights: Float32Array
  } | null>(null)
  const projected = useMemo(() => new Vector3(), [])
  function visibleAreas(room: Room, material: FloorMaterial) {
    const key =
      room +
      material +
      p.walls +
      p.occlusionKey +
      camera.matrixWorld.elements.join(',') +
      camera.projectionMatrix.elements.join(',')
    if (
      visibilityCache.current?.key === key &&
      visibilityCache.current.items === p.items
    )
      return visibilityCache.current.weights
    const weights = new Float32Array(
      floorCells(room, material).map((cell) => {
        let count = 0
        for (const [dx, dz] of [
          [0, 0],
          [-0.4, -0.4],
          [-0.4, 0.4],
          [0.4, -0.4],
          [0.4, 0.4],
        ]) {
          projected
            .set(cell.x + dx * cell.w, FLOOR_TOP + 0.002, cell.z + dz * cell.d)
            .project(camera)
          if (Math.abs(projected.x) > 1 || Math.abs(projected.y) > 1) continue
          uv.set(projected.x, projected.y)
          ray.setFromCamera(uv, camera)
          const first = ray.intersectObjects(scene.children, true).find((h) => {
            for (let o = h.object; o; o = o.parent!)
              if (!o.visible) return false
            return true
          })
          if (
            first &&
            first.point.y <= FLOOR_TOP + 0.006 &&
            first.point.y >= FLOOR_TOP - 0.005
          )
            count++
        }
        return (cell.area * count) / 5
      }),
    )
    visibilityCache.current = { key, items: p.items, weights }
    return weights
  }
  function down(e: ThreeEvent<PointerEvent>) {
    if (
      !p.enabled ||
      !p.material ||
      e.button !== 0 ||
      e.shiftKey ||
      gesture.current
    )
      return
    const room = floorRoom(e.point)
    if (!room) return
    e.stopPropagation()
    const before = p.floors.find((f) => f.room === room)!
    if (before.material && before.material !== p.material) {
      p.onConflict(room, p.material)
      return
    }
    if (before.complete) return
    p.onBegin()
    const laid = before.material
      ? before.laid.slice()
      : new Uint8Array(floorCells(room, p.material).length)
    Object.assign(views.get(room)!, { material: p.material, laid, dirty: true })
    gesture.current = {
      room,
      material: p.material,
      laid,
      last: { x: e.point.x, z: e.point.z },
      pointer: e.pointerId,
      changed: false,
      visible: visibleAreas(room, p.material),
    }
    p.active.current = true
    gl.domElement.setPointerCapture(e.pointerId)
  }
  return (
    <>
      <FloorLayer room="living" view={views.get('living')!} />
      <FloorLayer room="bedroom" view={views.get('bedroom')!} />
      <mesh
        rotation={[-Math.PI / 2, 0, 0]}
        position={[0, FLOOR_TOP + 0.002, 0]}
        onPointerDown={down}
        raycast={p.enabled ? Mesh.prototype.raycast : () => {}}
        userData={{ floorInstall: true }}
      >
        <planeGeometry args={[10, 7]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </>
  )
}
