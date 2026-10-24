import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js'
import { Matrix4, Mesh, Raycaster, Vector3 } from 'three'
import { prepareFurnitureAsset, furnitureAssets } from '../src/modelAssets'
import { furnitureVolumes, softSurfaceZones } from '../src/placementGeometry'
import { initialItems, validatePlacement, worldPose } from '../src/placement'
import { supportHeight } from '../src/grounding'

async function asset() {
  const source = await readFile('public/models/sofa/mint-sofa-v1.glb')
  const length = source.readUInt32LE(12)
  const json = JSON.parse(source.subarray(20, 20 + length).toString())
  // Geometry loader runs in Node without a DOM/image decoder. Check the actual
  // embedded material contract before omitting only image bindings for parsing.
  assert.equal(json.materials.length, 2)
  assert.equal(json.images.length, 1)
  assert.ok(json.images[0].bufferView !== undefined)
  assert.ok(
    json.materials.some(
      (m: any) => Math.abs((m.normalTexture?.scale ?? 0) - 0.35) < 1e-6,
    ),
  )
  assert.ok(
    json.materials.every(
      (m: any) => m.pbrMetallicRoughness.roughnessFactor >= 0.67,
    ),
  )
  for (const m of json.materials) delete m.normalTexture
  delete json.images
  delete json.textures
  delete json.samplers
  const text = Buffer.from(
    JSON.stringify(json).padEnd(
      Math.ceil(Buffer.byteLength(JSON.stringify(json)) / 4) * 4,
      ' ',
    ),
  )
  const bin = source.subarray(20 + length)
  const glb = Buffer.alloc(20 + text.length + bin.length)
  glb.write('glTF')
  glb.writeUInt32LE(2, 4)
  glb.writeUInt32LE(glb.length, 8)
  glb.writeUInt32LE(text.length, 12)
  glb.writeUInt32LE(0x4e4f534a, 16)
  text.copy(glb, 20)
  bin.copy(glb, 20 + text.length)
  const loaded = await new GLTFLoader().parseAsync(
    glb.buffer.slice(glb.byteOffset, glb.byteOffset + glb.length),
    '',
  )
  return prepareFurnitureAsset(loaded.scene)
}

test('integration GLB retains optimized triangle budget, two batches and portable fabric', async () => {
  const loaded = await asset()
  assert.equal(loaded.batches.length, 2)
  assert.equal(
    loaded.batches.reduce(
      (n, b) =>
        n +
        (b.geometry.index?.count ?? b.geometry.attributes.position.count) / 3,
      0,
    ),
    18060,
  )
  assert.equal(furnitureAssets.mintSofa.seatHeight, 0.855)
  loaded.dispose()
})

test('every GLB vertex stays in legacy sofa collision volumes on floor and rugs', async () => {
  const loaded = await asset()
  const sofa = initialItems.find((i) => i.id === 'sofa')!
  for (const floor of [0.015, 0.036, 0.045]) {
    const volumes = furnitureVolumes(sofa, floor)
    for (const batch of loaded.batches) {
      const geometry = batch.geometry.clone()
      if (batch.feet)
        geometry.applyMatrix4(
          new Matrix4()
            .makeScale(1, (0.25 - floor) / 0.25, 1)
            .setPosition(0, floor, 0),
        )
      const p = geometry.attributes.position,
        n = geometry.attributes.normal
      let bottom = Infinity
      for (let i = 0; i < p.count; i++) {
        const point = [p.getX(i), p.getY(i), p.getZ(i)]
        bottom = Math.min(bottom, point[1])
        assert.ok(point.every(Number.isFinite))
        assert.ok(Number.isFinite(n.getX(i) + n.getY(i) + n.getZ(i)))
        assert.ok(
          volumes.some((v) =>
            point.every((c, a) => Math.abs(c - v.p[a]) <= v.s[a] / 2 + 1e-5),
          ),
          `outside legacy union: ${point}`,
        )
      }
      if (batch.feet) assert.ok(Math.abs(bottom - floor) < 1e-6)
      geometry.dispose()
    }
  }
  loaded.dispose()
})

test('saved valid soft anchors meet the actual GLB seats, without back/arm occlusion', async () => {
  const loaded = await asset()
  const fabric = loaded.batches.find((b) => !b.feet)!
  const mesh = new Mesh(fabric.geometry, fabric.material)
  mesh.updateMatrixWorld()
  const sofa = initialItems.find((i) => i.id === 'sofa')!
  let checked = 0
  for (const zone of softSurfaceZones('sofa'))
    for (const dx of [-0.12, 0, 0.12])
      for (const dz of [-0.1, 0, 0.1]) {
        const book = {
          ...initialItems.find((i) => i.kind === 'book')!,
          surfaceId: 'sofa',
          surfaceZone: zone.id,
          x: dx,
          z: dz,
        }
        if (validatePlacement(book, [sofa])) continue
        const ray = new Raycaster(
          new Vector3(zone.centerX + book.x, 2, zone.center + book.z),
          new Vector3(0, -1, 0),
        )
        const hits = ray.intersectObject(mesh)
        assert.ok(hits.length, `${book.x},${book.z}`)
        assert.ok(
          Math.abs(hits[0].point.y - zone.height) < 0.006,
          `seat contact ${book.x},${book.z}: ${hits[0].point.y}`,
        )
        const items = [sofa, book]
        const pose = worldPose(book, items)
        assert.ok(Math.abs(pose.y - 0.856) < 1e-9)
        assert.equal(supportHeight(sofa, items), 0.015)
        checked++
      }
  assert.ok(checked >= 8)
  loaded.dispose()
})

test('GLB batch resources are disposed once per owner; clones can be released separately', async () => {
  const loaded = await asset()
  let geometries = 0,
    materials = 0
  for (const batch of loaded.batches) {
    batch.geometry.addEventListener('dispose', () => geometries++)
    batch.material.addEventListener('dispose', () => materials++)
  }
  const feet = loaded.batches.find((b) => b.feet)!.geometry.clone()
  feet.dispose()
  assert.equal(geometries, 0)
  loaded.dispose()
  assert.equal(geometries, 2)
  assert.equal(materials, 2)
})

test('indexed GLB picking matches native triangle hits, UVs and selected owner after free rotations', async () => {
  const loaded = await asset()
  for (const batch of loaded.batches)
    for (const angle of [0, (Math.PI * 37.5) / 180, Math.PI / 2]) {
      const native = new Mesh(batch.geometry, batch.material)
      native.position.set(-2.8, 0, -2.45)
      native.rotation.y = angle
      native.updateMatrixWorld()
      const indexed = new Mesh(batch.geometry, batch.material)
      indexed.matrixWorld.copy(native.matrixWorld)
      indexed.raycast = batch.picker.raycast
      for (let x = -1.4; x <= 1.4; x += 0.14)
        for (const z of [-0.6, -0.3, 0, 0.3, 0.6]) {
          const target = new Vector3(x, 0.6, z).applyMatrix4(native.matrixWorld)
          const origin = target.clone().add(new Vector3(0.2, 2, 2))
          const ray = new Raycaster(
            origin,
            target.clone().sub(origin).normalize(),
          )
          const expected = ray.intersectObject(native)
          const actual = ray.intersectObject(indexed)
          assert.equal(actual.length, expected.length)
          for (let i = 0; i < actual.length; i++) {
            assert.equal(actual[i].object, indexed)
            assert.ok(
              Math.abs(actual[i].distance - expected[i].distance) < 1e-7,
            )
            assert.ok(actual[i].point.distanceTo(expected[i].point) < 1e-7)
            assert.equal(actual[i].faceIndex, expected[i].faceIndex)
            if (actual[i].uv && expected[i].uv)
              assert.ok(actual[i].uv!.distanceTo(expected[i].uv!) < 1e-7)
          }
        }
    }
  loaded.dispose()
})
