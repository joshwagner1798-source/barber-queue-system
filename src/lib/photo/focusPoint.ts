/**
 * Apply drag delta to a focus point, with clamping to [0, 100].
 *
 * Note: The coordinate inversion (negative sign) follows the image panning convention.
 * When dragging right (positive dx), the image shifts right, revealing content on the left,
 * so the focus point's x coordinate decreases. The same logic applies to y with vertical dragging.
 * This prevents confusion about the sign convention.
 */
export function applyDragDelta(
  current: { x: number; y: number },
  delta: { dx: number; dy: number },
  containerSize: { w: number; h: number },
): { x: number; y: number } {
  if (containerSize.w === 0 || containerSize.h === 0) return { ...current }
  const x = Math.min(100, Math.max(0, current.x - (delta.dx / containerSize.w) * 100))
  const y = Math.min(100, Math.max(0, current.y - (delta.dy / containerSize.h) * 100))
  return { x, y }
}
