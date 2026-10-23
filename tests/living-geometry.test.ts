import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  livingParts,
  livingPartGeometry,
  buildLivingGeometry,
  type LivingPart,
} from '../src/livingGeometry'
import { furnitureVolumes, softSurfaceZones } from '../src/placementGeometry'
import { initialItems, catalog } from '../src/placement'

for (const kind of ['sofa', 'chair', 'table'] as const) {
  test(`${kind}: detailed visual parts remain inside original collision volumes on floor and rugs`, () => {
    const item = initialItems.find((item) => item.kind === kind)!
    for (const floor of [0.015, 0.036, 0.045]) {
      const volumes = furnitureVolumes(item, floor)
      for (const part of livingParts(kind, floor)) {
        const geometry = livingPartGeometry(part)
        const positions = geometry.getAttribute('position')
        const normals = geometry.getAttribute('normal')
        for (let i = 0; i < positions.count; i++) {
          const point = [
            positions.getX(i),
            positions.getY(i),
            positions.getZ(i),
          ]
          assert.ok(
            volumes.some((volume) =>
              point.every(
                (v, axis) =>
                  Math.abs(v - volume.p[axis]) <= volume.s[axis] / 2 + 1e-6,
              ),
            ),
            `${part.id}: ${point}`,
          )
          assert.ok(
            Number.isFinite(
              normals.getX(i) + normals.getY(i) + normals.getZ(i),
            ),
          )
        }
        geometry.dispose()
      }
    }
  })
  test(`${kind}: visual batch budget and fixed placement surfaces`, () => {
    const batches = buildLivingGeometry(kind, 0.015)
    assert.ok(batches.length <= (kind === 'table' ? 2 : 5))
    assert.ok(
      batches.every(
        (batch) => batch.geometry.getAttribute('position').count > 0,
      ),
    )
    batches.forEach((batch) => batch.geometry.dispose())
    if (kind === 'table') {
      const top = livingParts(kind, 0.015).find((part) => part.id === 'top')!
      assert.ok(
        Math.abs(top.p[1] + top.s[1] / 2 - catalog.table.surface!.height) <
          1e-10,
      )
    } else {
      for (const zone of softSurfaceZones(kind)) {
        const seat: LivingPart = livingParts(kind, 0.015).find(
          (part) => part.id === zone.id,
        )!
        assert.equal(seat.p[1] + seat.s[1] / 2, zone.height)
        assert.deepEqual([seat.s[0], seat.s[2]], zone.size)
      }
    }
  })
}
