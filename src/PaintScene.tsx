import { useEffect, useMemo, useRef, type MutableRefObject } from 'react'
import { useFrame, useThree, type ThreeEvent } from '@react-three/fiber'
import {
  CanvasTexture,
  LinearFilter,
  LinearMipmapLinearFilter,
  Group,
  Mesh,
  MeshStandardMaterial,
  Raycaster,
  Vector2,
} from 'three'
import { isEditing } from './controls'
import {
  paintGrid,
  fillPaint,
  paintColors,
  paintWalls,
  paintFraction,
  paintComplete,
  paintSegment,
  wallLocal,
  wallExit,
  onWall,
  type PaintColor,
  type PaintPoint,
  type PaintState,
  type PaintWall,
} from './painting'

type View = { mask: Uint8Array; color: PaintColor | null; changed: boolean }
type Props = {
  paint: PaintState[]
  enabled: boolean
  visible: boolean
  color: PaintColor
  cancelToken: number
  active: MutableRefObject<boolean>
  cancelRef: MutableRefObject<() => void>
  onBegin: () => void
  onCommit: (id: string, color: PaintColor, mask: Uint8Array) => void
  onProgress: (id: string, fraction: number) => void
  onHint: (message: string) => void
}
function WallLayer({
  wall,
  view,
  enabled,
  down,
}: {
  wall: PaintWall
  view: View
  enabled: boolean
  down: (e: ThreeEvent<PointerEvent>, wall: PaintWall) => void
}) {
  const { gl } = useThree()
  const material = useRef<MeshStandardMaterial>(null)
  const resources = useMemo(() => {
    const canvas = document.createElement('canvas')
    const { width, height } = paintGrid(wall)
    canvas.width = width
    canvas.height = height
    const context = canvas.getContext('2d')!
    const pixels = context.createImageData(width, height)
    pixels.data.fill(255)
    for (let i = 3; i < pixels.data.length; i += 4) pixels.data[i] = 0
    const texture = new CanvasTexture(canvas)
    texture.magFilter = LinearFilter
    texture.minFilter = LinearMipmapLinearFilter
    texture.anisotropy = Math.min(4, gl.capabilities.getMaxAnisotropy())
    return { context, pixels, texture }
  }, [wall, gl])
  useEffect(() => () => resources.texture.dispose(), [resources])
  const last = useRef<Uint8Array | null>(null)
  useFrame(() => {
    if (!view.changed && last.current === view.mask) return
    for (let i = 0; i < view.mask.length; i++) {
      resources.pixels.data[i * 4 + 3] = view.mask[i]
    }
    resources.context.putImageData(resources.pixels, 0, 0)
    resources.texture.needsUpdate = true
    material.current!.color.set(paintColors[view.color ?? 'sage'].hex)
    view.changed = false
    last.current = view.mask
  })
  return (
    <>
      <mesh
        position={[wall.x, wall.y, wall.z]}
        rotation={[0, wall.angle, 0]}
        receiveShadow
        userData={{ paintWall: wall.id }}
        raycast={
          enabled
            ? function (this: Mesh, ray, hits) {
                const candidates: typeof hits = []
                Mesh.prototype.raycast.call(this, ray, candidates)
                for (const h of candidates)
                  if (onWall(wall, wallLocal(wall, h.point))) hits.push(h)
              }
            : () => {}
        }
        onPointerDown={(e) => down(e, wall)}
      >
        <planeGeometry args={[wall.w, wall.h]} />
        <meshStandardMaterial
          ref={material}
          map={resources.texture}
          transparent
          depthWrite={false}
          roughness={1}
        />
      </mesh>
    </>
  )
}

export default function PaintScene(p: Props) {
  const { gl, camera, scene } = useThree()
  const current = useRef(p)
  current.current = p
  const views = useMemo(
    () =>
      new Map(
        p.paint.map((w) => [
          w.id,
          { mask: w.mask, color: w.color, changed: true },
        ]),
      ),
    [],
  )
  const roller = useRef<Group>(null)
  const cover = useRef<MeshStandardMaterial>(null)
  const ray = useMemo(() => new Raycaster(), [])
  const uv = useMemo(() => new Vector2(), [])
  const gesture = useRef<{
    wall: PaintWall
    color: PaintColor
    mask: Uint8Array
    last: PaintPoint | null
    pointer: number
    changed: boolean
  } | null>(null)
  const finishRef = useRef<(commit: boolean) => void>(() => {})
  useEffect(() => {
    for (const state of p.paint) {
      if (gesture.current?.wall.id === state.id) continue
      const view = views.get(state.id)!
      if (view.mask !== state.mask || view.color !== state.color)
        Object.assign(view, {
          mask: state.mask,
          color: state.color,
          changed: true,
        })
    }
  }, [p.paint, views])
  useEffect(() => {
    finishRef.current(false)
    if (roller.current) roller.current.visible = false
  }, [p.enabled, p.visible, p.color, p.cancelToken])
  useEffect(() => {
    const finish = (commit: boolean) => {
      const g = gesture.current
      if (!g) return
      gesture.current = null
      current.current.active.current = false
      if (roller.current) roller.current.visible = false
      if (gl.domElement.hasPointerCapture(g.pointer))
        gl.domElement.releasePointerCapture(g.pointer)
      const view = views.get(g.wall.id)!
      if (commit && g.changed) {
        if (paintComplete(g.mask, g.wall)) fillPaint(g.mask, g.wall)
        Object.assign(view, { mask: g.mask, color: g.color, changed: true })
        current.current.onCommit(g.wall.id, g.color, g.mask)
      } else
        Object.assign(
          view,
          current.current.paint.find((w) => w.id === g.wall.id)!,
          { changed: true },
        )
      current.current.onProgress(g.wall.id, paintFraction(view.mask, g.wall))
    }
    finishRef.current = finish
    p.cancelRef.current = () => finish(false)
    const showRoller = (
      wall: PaintWall,
      point: { x: number; y: number; z: number },
    ) => {
      roller.current!.visible = true
      roller.current!.rotation.y = wall.angle
      roller.current!.position.set(
        point.x + Math.sin(wall.angle) * 0.055,
        point.y,
        point.z + Math.cos(wall.angle) * 0.055,
      )
      cover.current!.color.set(
        paintColors[views.get(wall.id)!.color ?? current.current.color].hex,
      )
    }
    const move = (e: PointerEvent) => {
      const props = current.current,
        g = gesture.current
      if (!props.enabled || !props.visible) {
        finish(false)
        return
      }
      if (g && e.pointerId !== g.pointer) return
      if (g && !(e.buttons & 1)) {
        finish(true)
        return
      }
      if (e.buttons & 6 || isEditing(document.activeElement)) {
        roller.current!.visible = false
        return
      }
      const b = gl.domElement.getBoundingClientRect()
      uv.set(
        ((e.clientX - b.left) / b.width) * 2 - 1,
        1 - ((e.clientY - b.top) / b.height) * 2,
      )
      ray.setFromCamera(uv, camera)
      const first = ray.intersectObjects(scene.children, true).find((h) => {
        for (
          let object: typeof h.object | null = h.object;
          object;
          object = object.parent
        )
          if (!object.visible) return false
        return !h.object.userData.paintTool
      })
      const wall = paintWalls.find(
        (w) => w.id === first?.object.userData.paintWall,
      )
      if (!wall || (g && wall.id !== g.wall.id)) {
        if (g?.last) {
          const nx = Math.sin(g.wall.angle),
            nz = Math.cos(g.wall.angle)
          const distance =
            ((g.wall.x - ray.ray.origin.x) * nx +
              (g.wall.z - ray.ray.origin.z) * nz) /
            (ray.ray.direction.x * nx + ray.ray.direction.z * nz)
          if (Number.isFinite(distance) && distance > 0) {
            const outside = wallLocal(g.wall, {
              x: ray.ray.origin.x + ray.ray.direction.x * distance,
              y: ray.ray.origin.y + ray.ray.direction.y * distance,
              z: ray.ray.origin.z + ray.ray.direction.z * distance,
            })
            if (
              !onWall(g.wall, outside) &&
              paintSegment(
                g.mask,
                g.wall,
                g.last,
                wallExit(g.wall, g.last, outside),
              )
            ) {
              g.changed = true
              Object.assign(views.get(g.wall.id)!, {
                color: g.color,
                changed: true,
              })
              props.onProgress(g.wall.id, paintFraction(g.mask, g.wall))
            }
          }
        }
        if (g) g.last = null
        roller.current!.visible = false
        return
      }
      showRoller(wall, first!.point)
      if (!g) {
        props.onProgress(wall.id, paintFraction(views.get(wall.id)!.mask, wall))
        return
      }
      const next = wallLocal(wall, first!.point)
      if (g.last && paintSegment(g.mask, wall, g.last, next)) {
        g.changed = true
        const view = views.get(wall.id)!
        view.color = g.color
        view.changed = true
        props.onProgress(wall.id, paintFraction(g.mask, g.wall))
      }
      g.last = next
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
    const other = (e: PointerEvent) => {
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
    window.addEventListener('pointerdown', other, true)
    document.addEventListener('visibilitychange', hidden)
    return () => {
      cancel()
      p.cancelRef.current = () => {}
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
      window.removeEventListener('pointercancel', cancel)
      window.removeEventListener('blur', cancel)
      window.removeEventListener('keydown', key, true)
      window.removeEventListener('pointerdown', other, true)
      document.removeEventListener('visibilitychange', hidden)
    }
  }, [gl, camera, scene, views, ray, uv, p.cancelRef])
  function down(e: ThreeEvent<PointerEvent>, wall: PaintWall) {
    if (
      !p.enabled ||
      !p.visible ||
      e.button !== 0 ||
      e.shiftKey ||
      gesture.current ||
      isEditing(e.target)
    )
      return
    e.stopPropagation()
    const view = views.get(wall.id)!
    if (paintComplete(view.mask, wall)) {
      p.onHint('Эта стена уже покрашена')
      return
    }
    if (view.color && view.color !== p.color) {
      p.onHint(
        `Цвет стены закреплён: ${paintColors[view.color].name}. Для другого цвета отмените мазки до начала.`,
      )
      return
    }
    p.onBegin()
    const mask = view.mask.slice()
    view.mask = mask
    gesture.current = {
      wall,
      color: view.color ?? p.color,
      mask,
      last: wallLocal(wall, e.point),
      pointer: e.pointerId,
      changed: false,
    }
    p.active.current = true
    gl.domElement.setPointerCapture(e.pointerId)
    roller.current!.visible = true
    roller.current!.rotation.y = wall.angle
    roller.current!.position.set(
      e.point.x + Math.sin(wall.angle) * 0.055,
      e.point.y,
      e.point.z + Math.cos(wall.angle) * 0.055,
    )
    cover.current!.color.set(paintColors[p.color].hex)
    p.onProgress(wall.id, paintFraction(mask, wall))
  }
  return (
    <>
      {p.visible &&
        paintWalls.map((wall) => (
          <WallLayer
            key={wall.id}
            wall={wall}
            view={views.get(wall.id)!}
            enabled={p.enabled}
            down={down}
          />
        ))}
      <group ref={roller} visible={false}>
        <mesh
          rotation={[0, 0, Math.PI / 2]}
          userData={{ paintTool: true }}
          raycast={() => {}}
        >
          <cylinderGeometry args={[0.045, 0.045, 0.34, 12]} />
          <meshStandardMaterial
            ref={cover}
            color={paintColors[p.color].hex}
            roughness={1}
          />
        </mesh>
        <mesh
          position={[0.15, -0.085, 0.045]}
          userData={{ paintTool: true }}
          raycast={() => {}}
        >
          <boxGeometry args={[0.025, 0.17, 0.025]} />
          <meshStandardMaterial color="#aaa99d" />
        </mesh>
        <mesh
          position={[0.06, -0.17, 0.045]}
          userData={{ paintTool: true }}
          raycast={() => {}}
        >
          <boxGeometry args={[0.2, 0.025, 0.025]} />
          <meshStandardMaterial color="#aaa99d" />
        </mesh>
        <mesh
          position={[-0.03, -0.26, 0.045]}
          userData={{ paintTool: true }}
          raycast={() => {}}
        >
          <boxGeometry args={[0.055, 0.18, 0.055]} />
          <meshStandardMaterial color="#b89468" />
        </mesh>
      </group>
    </>
  )
}
