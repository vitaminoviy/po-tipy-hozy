import {
  DataTexture,
  RGBAFormat,
  UnsignedByteType,
  LinearFilter,
  LinearMipmapLinearFilter,
  NoColorSpace,
} from 'three'
import { paintGrid, type PaintWall } from './painting'
// Coverage is linear data, not paint color. Three's alphaMap reads green.
// An opaque backing avoids Canvas premultiplication discarding transparent RGB.
export function createPaintTexture(wall: PaintWall) {
  const { width, height, length } = paintGrid(wall)
  const data = new Uint8Array(length * 4)
  for (let i = 3; i < data.length; i += 4) data[i] = 255
  const texture = new DataTexture(
    data,
    width,
    height,
    RGBAFormat,
    UnsignedByteType,
  )
  texture.colorSpace = NoColorSpace
  texture.flipY = true
  texture.generateMipmaps = true
  texture.magFilter = LinearFilter
  texture.minFilter = LinearMipmapLinearFilter
  texture.premultiplyAlpha = false
  return texture
}
export function updatePaintTexture(texture: DataTexture, mask: Uint8Array) {
  const data = texture.image.data
  if (data.length !== mask.length * 4)
    throw new Error('Paint texture dimensions do not match coverage')
  for (let i = 0; i < mask.length; i++)
    data[i * 4] = data[i * 4 + 1] = data[i * 4 + 2] = mask[i]
  texture.needsUpdate = true
}
