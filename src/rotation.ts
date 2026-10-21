// Stored angles retain the existing unit (one = 90 degrees); fractions are free angles.
export const TAP_ANGLE = 7.5 / 90
export const TAP_SECONDS = 0.14
export const ROTATION_SPEED = 75 / 90
export const normalizeRotation = (angle: number) => {
  const normalized = ((angle % 4) + 4) % 4
  return normalized < 1e-12 || 4 - normalized < 1e-12 ? 0 : normalized
}
export type RotationMotion = {
  angle: number
  from: number
  target: number
  elapsed: number
  direction: number
  held: boolean
}
export function beginRotation(
  angle: number,
  direction: number,
  held = true,
): RotationMotion {
  return {
    angle,
    from: angle,
    target: angle + direction * TAP_ANGLE,
    elapsed: 0,
    direction,
    held,
  }
}
export function advanceRotation(
  motion: RotationMotion,
  dt: number,
): RotationMotion {
  const elapsed = motion.elapsed + Math.max(0, dt)
  const t = Math.min(1, elapsed / TAP_SECONDS)
  const ease = t * t * (3 - 2 * t)
  const extra = motion.held
    ? Math.max(0, elapsed - TAP_SECONDS) * ROTATION_SPEED * motion.direction
    : 0
  return {
    ...motion,
    elapsed,
    angle: motion.from + (motion.target - motion.from) * ease + extra,
  }
}
export function releaseRotation(m: RotationMotion): RotationMotion | null {
  // A released tap finishes its small 140 ms transition. A held turn stops now.
  return m.elapsed < TAP_SECONDS ? { ...m, held: false } : null
}
