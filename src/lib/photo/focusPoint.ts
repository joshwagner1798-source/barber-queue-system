export function applyDragDelta(
  current: { x: number; y: number },
  delta: { dx: number; dy: number },
  containerSize: { w: number; h: number },
): { x: number; y: number } {
  const x = Math.min(100, Math.max(0, current.x - (delta.dx / containerSize.w) * 100))
  const y = Math.min(100, Math.max(0, current.y - (delta.dy / containerSize.h) * 100))
  return { x, y }
}
