export type Planar = {
  x: number
  z: number
  w: number
  d: number
  angle?: number
  circle?: boolean
}
export type Point = { x: number; z: number }
export function basis(angle = 0) {
  const clean = (v: number) => (Math.abs(v) < 1e-12 ? 0 : v)
  return { c: clean(Math.cos(angle)), s: clean(Math.sin(angle)) }
}
export function axisBounds(a: Planar) {
  const { c, s } = basis(a.angle)
  return {
    x: a.x,
    z: a.z,
    w: a.circle ? a.w : Math.abs(c) * a.w + Math.abs(s) * a.d,
    d: a.circle ? a.d : Math.abs(s) * a.w + Math.abs(c) * a.d,
    circle: !!a.circle,
  }
}
export function corners(a: Planar): Point[] {
  const { c, s } = basis(a.angle)
  return [
    [-1, -1],
    [-1, 1],
    [1, 1],
    [1, -1],
  ].map(([x, z]) => ({
    x: a.x + (c * x * a.w) / 2 + (s * z * a.d) / 2,
    z: a.z - (s * x * a.w) / 2 + (c * z * a.d) / 2,
  }))
}
export function overlaps(a: Planar, b: Planar, epsilon = 1e-6) {
  if (a.circle || b.circle) return planarDistance(a, b) < -epsilon
  const ac = corners(a),
    bc = corners(b)
  for (const shape of [a, b]) {
    const { c, s } = basis(shape.angle)
    for (const [x, z] of [
      [c, -s],
      [s, c],
    ]) {
      const av = ac.map((p) => p.x * x + p.z * z),
        bv = bc.map((p) => p.x * x + p.z * z)
      if (
        Math.min(Math.max(...av), Math.max(...bv)) -
          Math.max(Math.min(...av), Math.min(...bv)) <=
        epsilon
      )
        return false
    }
  }
  return true
}
function segmentDistance(p: Point, a: Point, b: Point) {
  const x = b.x - a.x,
    z = b.z - a.z
  const t = Math.max(
    0,
    Math.min(1, ((p.x - a.x) * x + (p.z - a.z) * z) / (x * x + z * z)),
  )
  return Math.hypot(p.x - a.x - t * x, p.z - a.z - t * z)
}
// SAT for intersections, exact segment distance for the existing millimetre/cm gaps.
export function planarDistance(a: Planar, b: Planar): number {
  if (a.circle && b.circle)
    return Math.hypot(a.x - b.x, a.z - b.z) - (a.w + b.w) / 2
  if (a.circle || b.circle) {
    const circle = a.circle ? a : b,
      box = a.circle ? b : a,
      { c, s } = basis(box.angle)
    const x = c * (circle.x - box.x) - s * (circle.z - box.z),
      z = s * (circle.x - box.x) + c * (circle.z - box.z)
    return (
      Math.hypot(
        Math.max(0, Math.abs(x) - box.w / 2),
        Math.max(0, Math.abs(z) - box.d / 2),
      ) -
      circle.w / 2
    )
  }
  if (overlaps(a, b, -1e-10)) return 0
  const ac = corners(a),
    bc = corners(b)
  let distance = Infinity
  for (const [first, second] of [
    [ac, bc],
    [bc, ac],
  ])
    for (const p of first)
      for (let i = 0; i < 4; i++)
        distance = Math.min(
          distance,
          segmentDistance(p, second[i], second[(i + 1) % 4]),
        )
  return distance
}
