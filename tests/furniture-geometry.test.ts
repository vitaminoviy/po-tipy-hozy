import { test } from 'node:test'
import assert from 'node:assert/strict'
import { BoxGeometry, Vector3 } from 'three'
import { upholsteredParts, type BoxPart } from '../src/furnitureGeometry'
import { catalog } from '../src/placement'

// Only equal outward normals compete for visible depth. Opposite-facing
// touching surfaces are legitimate joints and must not be treated as overlap.
function coplanarOverlaps(parts: BoxPart[]) {
  const overlaps: string[] = []
  for (let a = 0; a < parts.length; a++) {
    for (let b = a + 1; b < parts.length; b++) {
      for (let axis = 0; axis < 3; axis++) {
        for (const sign of [-1, 1]) {
          const first = parts[a],
            second = parts[b]
          const planeA = first.p[axis] + (sign * first.s[axis]) / 2
          const planeB = second.p[axis] + (sign * second.s[axis]) / 2
          if (Math.abs(planeA - planeB) > 1e-6) continue
          const area = [0, 1, 2]
            .filter((i) => i !== axis)
            .reduce(
              (area, i) =>
                area *
                Math.max(
                  0,
                  Math.min(
                    first.p[i] + first.s[i] / 2,
                    second.p[i] + second.s[i] / 2,
                  ) -
                    Math.max(
                      first.p[i] - first.s[i] / 2,
                      second.p[i] - second.s[i] / 2,
                    ),
                ),
              1,
            )
          if (area > 1e-8)
            overlaps.push(
              `${first.id}/${second.id}: axis ${axis}, sign ${sign}`,
            )
        }
      }
    }
  }
  return overlaps
}

test('coplanar regression detector reproduces all three original defects', () => {
  const original = structuredClone(upholsteredParts)
  original.sofa.find((p) => p.id === 'base')!.s = [2.5, 0.55, 1.1]
  for (const p of original.sofa.filter((p) => p.id.startsWith('arm'))) {
    p.p[2] = 0
    p.s[2] = 1.1
  }
  original.chair.find((p) => p.id === 'base')!.s = [1, 0.5, 1]
  for (const p of original.chair.filter((p) => p.id.startsWith('arm'))) {
    p.p[2] = 0
    p.s[2] = 1
  }
  original.bed.find((p) => p.id === 'blanket')!.s[2] = 1.8
  assert.equal(coplanarOverlaps(original.sofa).length, 9)
  assert.equal(coplanarOverlaps(original.chair).length, 13)
  assert.equal(coplanarOverlaps(original.bed).length, 1)
})

for (const kind of ['sofa', 'chair', 'bed'] as const) {
  test(`${kind}: no competing coplanar faces, valid outward normals and no duplicate triangles`, () => {
    const parts = upholsteredParts[kind]
    assert.deepEqual(coplanarOverlaps(parts), [])
    assert.equal(new Set(parts.map((p) => p.id)).size, parts.length)
    for (const part of parts) {
      assert.ok(part.s.every((n) => Number.isFinite(n) && n > 0))
      const geometry = new BoxGeometry(...part.s)
      const positions = geometry.attributes.position,
        normals = geometry.attributes.normal
      for (let i = 0; i < normals.count; i++) {
        const n = new Vector3().fromBufferAttribute(normals, i),
          p = new Vector3().fromBufferAttribute(positions, i)
        assert.ok(Math.abs(n.length() - 1) < 1e-6)
        assert.ok(n.dot(p) > 0)
      }
      const triangles = new Set<string>()
      for (let i = 0; i < geometry.index!.count; i += 3) {
        const points = [0, 1, 2].map((offset) =>
          new Vector3().fromBufferAttribute(
            positions,
            geometry.index!.getX(i + offset),
          ),
        )
        assert.ok(
          points[1]
            .clone()
            .sub(points[0])
            .cross(points[2].clone().sub(points[0]))
            .lengthSq() > 1e-12,
        )
        const key = points
          .map((p) => p.toArray().join(','))
          .sort()
          .join(';')
        assert.ok(!triangles.has(key))
        triangles.add(key)
      }
      assert.equal(triangles.size, 12)
      geometry.dispose()
    }
  })
  test(`${kind}: corrected geometry remains within existing placement bounds`, () => {
    const parts = upholsteredParts[kind],
      bounds = catalog[kind]
    for (const p of parts) {
      assert.ok(Math.abs(p.p[0]) + p.s[0] / 2 <= bounds.size[0] / 2 + 1e-6)
      assert.ok(Math.abs(p.p[2]) + p.s[2] / 2 <= bounds.size[1] / 2 + 1e-6)
      assert.ok(p.p[1] + p.s[1] / 2 <= bounds.height + 1e-6)
    }
  })
}
