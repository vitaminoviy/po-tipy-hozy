import {
  createContext,
  useContext,
  useEffect,
  useMemo,
  type ReactNode,
} from 'react'
import { CanvasTexture, RepeatWrapping, SRGBColorSpace } from 'three'
const Surfaces = createContext<{
  wood: CanvasTexture
  fabric: CanvasTexture
  linen: CanvasTexture
  oak: CanvasTexture
} | null>(null)
function texture(fabric: boolean, refined = false) {
  const canvas = document.createElement('canvas')
  canvas.width = canvas.height = 256
  const ctx = canvas.getContext('2d')!
  const pixels = ctx.createImageData(256, 256)
  for (let y = 0; y < 256; y++)
    for (let x = 0; x < 256; x++) {
      const grain = fabric
        ? ((x % 4 < 2 ? 1 : -1) + (y % 4 < 2 ? 1 : -1)) * 3
        : Math.sin(y * 0.55 + Math.sin(x * 0.025) * 2) * 5 +
          Math.sin(y * 1.7 + x * 0.02) * 2
      const variation = refined
        ? fabric
          ? Math.sin(x * 2.39 + y * 5.17) * 2 +
            grain * 0.38 +
            Math.sin(x * 0.16 + y * 0.23) * 1.5
          : Math.sin(y * 0.22 + Math.sin(x * 0.013) * 3) * 4 +
            Math.sin(y * 0.9 + Math.sin(x * 0.04)) * 1.8
        : grain
      const v = Math.round(245 + variation),
        i = (y * 256 + x) * 4
      pixels.data[i] = pixels.data[i + 1] = pixels.data[i + 2] = v
      pixels.data[i + 3] = 255
    }
  ctx.putImageData(pixels, 0, 0)
  const map = new CanvasTexture(canvas)
  map.colorSpace = SRGBColorSpace
  map.wrapS = map.wrapT = RepeatWrapping
  map.anisotropy = 4
  return map
}
export function VisualMaterials({ children }: { children: ReactNode }) {
  const maps = useMemo(
    () => ({
      wood: texture(false),
      fabric: texture(true),
      linen: texture(true, true),
      oak: texture(false, true),
    }),
    [],
  )
  useEffect(
    () => () => {
      maps.wood.dispose()
      maps.fabric.dispose()
      maps.linen.dispose()
      maps.oak.dispose()
    },
    [maps],
  )
  return <Surfaces.Provider value={maps}>{children}</Surfaces.Provider>
}
export function useSurface(
  kind: 'wood' | 'fabric' | 'plain' | 'linen' | 'oak',
) {
  const maps = useContext(Surfaces)
  return kind === 'plain' ? undefined : maps?.[kind]
}
