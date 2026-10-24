import {
  Box3,
  BufferGeometry,
  Intersection,
  Matrix4,
  Mesh,
  Ray,
  Raycaster,
  Sphere,
  Vector3,
} from 'three'

// Static CPU-only AABB tree. Leaves use Three's exact triangle/UV/normal test;
// no proxy silhouette, collision changes, extra draw calls or GPU buffers.
export function createMeshPicker(geometry: BufferGeometry) {
  const position = geometry.getAttribute('position')
  const index = geometry.getIndex()
  const count = (index?.count ?? position.count) / 3
  const bounds = new Float64Array(count * 6)
  const vertex = new Vector3()
  const vertexIndex = (triangle: number, corner: number) =>
    index ? index.getX(triangle * 3 + corner) : triangle * 3 + corner
  for (let t = 0; t < count; t++) {
    const box = new Box3()
    for (let corner = 0; corner < 3; corner++)
      box.expandByPoint(
        vertex.fromBufferAttribute(position, vertexIndex(t, corner)),
      )
    bounds.set([...box.min.toArray(), ...box.max.toArray()], t * 6)
  }
  type Node = {
    box: Box3
    left?: Node
    right?: Node
    geometry?: BufferGeometry
    triangles?: number[]
  }
  const leaves: BufferGeometry[] = []
  function build(triangles: number[]): Node {
    const box = new Box3()
    for (const t of triangles) {
      box.expandByPoint(vertex.fromArray(bounds, t * 6))
      box.expandByPoint(vertex.fromArray(bounds, t * 6 + 3))
    }
    if (triangles.length <= 64) {
      const leaf = new BufferGeometry()
      for (const [name, attribute] of Object.entries(geometry.attributes))
        leaf.setAttribute(name, attribute)
      leaf.setIndex(
        triangles.flatMap((t) => [0, 1, 2].map((c) => vertexIndex(t, c))),
      )
      leaf.boundingBox = box
      leaf.boundingSphere = box.getBoundingSphere(new Sphere())
      leaves.push(leaf)
      return { box, geometry: leaf, triangles }
    }
    const size = box.getSize(new Vector3())
    const axis =
      size.x > size.y && size.x > size.z ? 0 : size.y > size.z ? 1 : 2
    triangles.sort(
      (a, b) =>
        bounds[a * 6 + axis] +
        bounds[a * 6 + axis + 3] -
        bounds[b * 6 + axis] -
        bounds[b * 6 + axis + 3],
    )
    const middle = Math.floor(triangles.length / 2)
    return {
      box,
      left: build(triangles.slice(0, middle)),
      right: build(triangles.slice(middle)),
    }
  }
  const root = build(Array.from({ length: count }, (_, i) => i))
  const inverse = new Matrix4(),
    localRay = new Ray(),
    scratch: Mesh = new Mesh(undefined, [])
  function raycast(this: Mesh, raycaster: Raycaster, hits: Intersection[]) {
    const owner = this
    inverse.copy(owner.matrixWorld).invert()
    localRay.copy(raycaster.ray).applyMatrix4(inverse)
    scratch.matrixWorld.copy(owner.matrixWorld)
    scratch.material = owner.material
    function visit(node: Node) {
      if (!localRay.intersectsBox(node.box)) return
      if (node.geometry) {
        scratch.geometry = node.geometry
        const start = hits.length
        scratch.raycast(raycaster, hits)
        for (let i = start; i < hits.length; i++) {
          hits[i].object = owner
          if (hits[i].faceIndex != null)
            hits[i].faceIndex = node.triangles![hits[i].faceIndex!]
        }
      } else {
        visit(node.left!)
        visit(node.right!)
      }
    }
    visit(root)
  }
  return { raycast, dispose: () => leaves.forEach((leaf) => leaf.dispose()) }
}
