# Barber Photo Focus Point Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let admins drag-to-reposition each barber's photo in the admin panel so the barber's face is properly framed on the TV display.

**Architecture:** Two new float columns (`photo_x`, `photo_y`, default 50) stored per barber in the `users` table. The admin `BarberPhotosPanel` gains a circular drag editor that saves values via the existing PATCH endpoint. `BarberCard` reads these values as props and applies them via CSS `objectPosition`. The drag math is extracted into a pure utility function for testability.

**Tech Stack:** Next.js 16 (App Router), TypeScript, Supabase (PostgreSQL), Tailwind CSS, Vitest

---

## File Map

| Action | Path | Responsibility |
|--------|------|----------------|
| Create | `supabase/migrations/00019_barber_photo_position.sql` | Add `photo_x`, `photo_y` columns to `users` |
| Create | `src/lib/photo/__tests__/focusPoint.test.ts` | Unit tests for drag math utility |
| Create | `src/lib/photo/focusPoint.ts` | Pure function: converts mouse delta → new clamped x/y percentages |
| Modify | `src/app/api/barbers/route.ts` | Add `photo_x, photo_y` to SELECT |
| Modify | `src/app/api/owner/barbers/[id]/route.ts` | Add `photo_x`, `photo_y` to `ALLOWED_FIELDS` |
| Modify | `src/components/BarberCard.tsx` | Accept `photoX`/`photoY` props, apply as `objectPosition` |
| Modify | `src/app/admin/BarberPhotosPanel.tsx` | Add drag-to-reposition editor per barber |

---

## Task 1: Database Migration

**Files:**
- Create: `supabase/migrations/00019_barber_photo_position.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- supabase/migrations/00019_barber_photo_position.sql
alter table users
  add column if not exists photo_x float default 50,
  add column if not exists photo_y float default 50;
```

- [ ] **Step 2: Apply the migration**

Run in the Supabase dashboard SQL editor, or via CLI:
```bash
supabase db push
```
Expected: no errors. Verify the `users` table now has `photo_x` and `photo_y` columns with default 50.

- [ ] **Step 3: Commit**

```bash
git add supabase/migrations/00019_barber_photo_position.sql
git commit -m "feat: add photo_x/photo_y columns to users for focus point"
```

---

## Task 2: Drag Math Utility (TDD)

This is a pure function — extract the math so it can be tested independently of the component.

**Files:**
- Create: `src/lib/photo/__tests__/focusPoint.test.ts`
- Create: `src/lib/photo/focusPoint.ts`

**What the function does:**
Given the current `(x, y)` percentages, a mouse drag delta `(dx, dy)` in pixels, and the container size in pixels — return new `(x, y)` percentages clamped to `[0, 100]`.

Dragging the photo right (`dx > 0`) decreases `x` (the image shifts right, revealing left content). Dragging down (`dy > 0`) decreases `y`.

Formula:
```
new_x = clamp(x - (dx / containerWidth)  * 100, 0, 100)
new_y = clamp(y - (dy / containerHeight) * 100, 0, 100)
```

- [ ] **Step 1: Write the failing tests**

```typescript
// src/lib/photo/__tests__/focusPoint.test.ts
import { describe, it, expect } from 'vitest'
import { applyDragDelta } from '../focusPoint'

const container = { w: 100, h: 100 }

describe('applyDragDelta', () => {
  it('returns unchanged values when delta is zero', () => {
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: 0, dy: 0 }, container))
      .toEqual({ x: 50, y: 50 })
  })

  it('decreases x when dragging right', () => {
    // drag right 50px on a 100px container = -50% x
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: 50, dy: 0 }, container))
      .toEqual({ x: 0, y: 50 })
  })

  it('increases x when dragging left', () => {
    // drag left 50px = +50% x
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: -50, dy: 0 }, container))
      .toEqual({ x: 100, y: 50 })
  })

  it('decreases y when dragging down', () => {
    expect(applyDragDelta({ x: 50, y: 50 }, { dx: 0, dy: 50 }, container))
      .toEqual({ x: 50, y: 0 })
  })

  it('clamps x to 0 when dragging far right', () => {
    expect(applyDragDelta({ x: 10, y: 50 }, { dx: 999, dy: 0 }, container))
      .toEqual({ x: 0, y: 50 })
  })

  it('clamps x to 100 when dragging far left', () => {
    expect(applyDragDelta({ x: 90, y: 50 }, { dx: -999, dy: 0 }, container))
      .toEqual({ x: 100, y: 50 })
  })

  it('clamps y to 0 when dragging far down', () => {
    expect(applyDragDelta({ x: 50, y: 10 }, { dx: 0, dy: 999 }, container))
      .toEqual({ x: 50, y: 0 })
  })

  it('clamps y to 100 when dragging far up', () => {
    expect(applyDragDelta({ x: 50, y: 90 }, { dx: 0, dy: -999 }, container))
      .toEqual({ x: 50, y: 100 })
  })

  it('handles non-square containers', () => {
    // 200px wide container, drag right 100px = -50% x
    expect(applyDragDelta({ x: 60, y: 60 }, { dx: 100, dy: 0 }, { w: 200, h: 100 }))
      .toEqual({ x: 10, y: 60 })
  })
})
```

- [ ] **Step 2: Run tests to confirm they fail**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npm run test -- src/lib/photo/__tests__/focusPoint.test.ts
```
Expected: FAIL — `Cannot find module '../focusPoint'`

- [ ] **Step 3: Implement the utility**

```typescript
// src/lib/photo/focusPoint.ts

export function applyDragDelta(
  current: { x: number; y: number },
  delta: { dx: number; dy: number },
  containerSize: { w: number; h: number },
): { x: number; y: number } {
  const x = Math.min(100, Math.max(0, current.x - (delta.dx / containerSize.w) * 100))
  const y = Math.min(100, Math.max(0, current.y - (delta.dy / containerSize.h) * 100))
  return { x, y }
}
```

- [ ] **Step 4: Run tests to confirm they pass**

```bash
npm run test -- src/lib/photo/__tests__/focusPoint.test.ts
```
Expected: all 9 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/lib/photo/focusPoint.ts src/lib/photo/__tests__/focusPoint.test.ts
git commit -m "feat: add applyDragDelta utility for photo focus point"
```

---

## Task 3: API — Expose photo_x / photo_y

**Files:**
- Modify: `src/app/api/barbers/route.ts`
- Modify: `src/app/api/owner/barbers/[id]/route.ts`

### 3a — Public barbers endpoint

- [ ] **Step 1: Add fields to SELECT in `/api/barbers/route.ts`**

Find this line (line 8):
```typescript
    .select('id, first_name, last_name, avatar_url')
```
Change it to:
```typescript
    .select('id, first_name, last_name, avatar_url, photo_x, photo_y')
```

### 3b — Owner PATCH endpoint

- [ ] **Step 2: Add fields to ALLOWED_FIELDS in `/api/owner/barbers/[id]/route.ts`**

Find this line (line 4):
```typescript
const ALLOWED_FIELDS = new Set(['first_name', 'last_name', 'is_active', 'walkin_enabled'])
```
Change it to:
```typescript
const ALLOWED_FIELDS = new Set(['first_name', 'last_name', 'is_active', 'walkin_enabled', 'photo_x', 'photo_y'])
```

- [ ] **Step 3: Verify manually**

With the dev server running (`npm run dev`), call:
```bash
curl http://localhost:3000/api/barbers
```
Expected: each barber object now includes `photo_x` and `photo_y` (both `50` for existing barbers).

- [ ] **Step 4: Commit**

```bash
git add src/app/api/barbers/route.ts src/app/api/owner/barbers/[id]/route.ts
git commit -m "feat: expose photo_x/photo_y in barbers API"
```

---

## Task 4: Update BarberCard to Use Focus Point

**Files:**
- Modify: `src/components/BarberCard.tsx`

The `Props` interface currently has no `photoX`/`photoY`. We add two optional props and apply them as an inline `objectPosition` style. The existing `imageClassName` prop is left unchanged.

- [ ] **Step 1: Add props to the interface**

Find the `Props` interface (around line 57). Add two new optional fields after `imageClassName`:

```typescript
  photoX?: number | null
  photoY?: number | null
```

- [ ] **Step 2: Add props to the function signature**

Find the destructured parameters of `BarberCard` (around line 75). Add after `imageClassName`:

```typescript
  photoX = 50,
  photoY = 50,
```

- [ ] **Step 3: Update the img tag**

Find the img tag for the photo (around line 161–165):

```tsx
          <img
            src={avatarUrl}
            alt={shortName}
            className={`absolute inset-0 w-full h-full object-cover object-top${imageClassName ? ` ${imageClassName}` : ''}`}
          />
```

Replace with:

```tsx
          <img
            src={avatarUrl}
            alt={shortName}
            className={`absolute inset-0 w-full h-full object-cover${imageClassName ? ` ${imageClassName}` : ''}`}
            style={{ objectPosition: `${photoX}% ${photoY}%` }}
          />
```

Note: `object-top` is removed — the inline `objectPosition` style now controls framing.

- [ ] **Step 4: Verify the dev server still renders BarberCard**

Run `npm run dev` and open the TV display. Existing barbers should look the same (defaulting to 50%/50% = centered, which is similar to the former `object-top`).

> Note: `object-top` previously showed the top-center of the image (equivalent to `50% 0%`). After this change, existing barbers will default to `50% 50%` (center). If any barber's photo looks worse, use the new editor (Task 5) to fix their focus point.

- [ ] **Step 5: Commit**

```bash
git add src/components/BarberCard.tsx
git commit -m "feat: BarberCard accepts photoX/photoY props for dynamic object-position"
```

---

## Task 5: BarberPhotosPanel — Drag Editor

**Files:**
- Modify: `src/app/admin/BarberPhotosPanel.tsx`

This is the main UI change. The panel already fetches barbers from `/api/barbers` and shows a small circular preview per barber. We extend the `Barber` interface to include `photo_x` / `photo_y`, add drag state, and render a circular drag editor below each barber's existing upload button.

The editor only renders when `barber.avatar_url` is non-null.

- [ ] **Step 1: Extend the Barber interface**

Find the `Barber` interface (lines 5–10):
```typescript
interface Barber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
}
```

Replace with:
```typescript
interface Barber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  photo_x: number | null
  photo_y: number | null
}
```

- [ ] **Step 2: Add drag state and import**

Add `applyDragDelta` import at the top of the file (after `'use client'`):
```typescript
import { applyDragDelta } from '@/lib/photo/focusPoint'
```

Inside `BarberPhotosPanel`, add new state variables after the existing ones:
```typescript
  const [photoPos, setPhotoPos] = useState<Record<string, { x: number; y: number }>>({})
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [saveError, setSaveError] = useState<Record<string, string>>({})
  const dragState = useRef<{
    barberId: string
    startCursor: { x: number; y: number }
    startPos: { x: number; y: number }
    containerSize: { w: number; h: number }
  } | null>(null)
```

- [ ] **Step 3: Seed photoPos when barbers load**

Replace the existing `useEffect` (lines 18–23):
```typescript
  useEffect(() => {
    fetch('/api/barbers')
      .then(r => r.json())
      .then(setBarbers)
      .catch(() => {})
  }, [])
```

With:
```typescript
  useEffect(() => {
    fetch('/api/barbers')
      .then(r => r.json())
      .then((data: Barber[]) => {
        setBarbers(data)
        const initial: Record<string, { x: number; y: number }> = {}
        for (const b of data) {
          initial[b.id] = { x: b.photo_x ?? 50, y: b.photo_y ?? 50 }
        }
        setPhotoPos(initial)
      })
      .catch(() => {})
  }, [])
```

- [ ] **Step 4: Add drag handlers**

Add these three functions inside `BarberPhotosPanel`, after the existing `handleFileChange` function:

```typescript
  function handleDragStart(
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
    barberId: string,
    containerEl: HTMLDivElement,
  ) {
    e.preventDefault()
    const rect = containerEl.getBoundingClientRect()
    const cursor =
      'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY }
    dragState.current = {
      barberId,
      startCursor: cursor,
      startPos: photoPos[barberId] ?? { x: 50, y: 50 },
      containerSize: { w: rect.width, h: rect.height },
    }
  }

  function handleDragMove(
    e: React.MouseEvent<HTMLDivElement> | React.TouchEvent<HTMLDivElement>,
  ) {
    if (!dragState.current) return
    const { barberId, startCursor, startPos, containerSize } = dragState.current
    const cursor =
      'touches' in e
        ? { x: e.touches[0].clientX, y: e.touches[0].clientY }
        : { x: e.clientX, y: e.clientY }
    const delta = { dx: cursor.x - startCursor.x, dy: cursor.y - startCursor.y }
    const newPos = applyDragDelta(startPos, delta, containerSize)
    setPhotoPos(prev => ({ ...prev, [barberId]: newPos }))
  }

  async function handleDragEnd(barberId: string) {
    if (!dragState.current || dragState.current.barberId !== barberId) return
    dragState.current = null
    const pos = photoPos[barberId]
    if (!pos) return
    setSaving(p => ({ ...p, [barberId]: true }))
    setSaveError(p => ({ ...p, [barberId]: '' }))
    try {
      const res = await fetch(`/api/owner/barbers/${barberId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ photo_x: pos.x, photo_y: pos.y }),
      })
      if (!res.ok) {
        const d = await res.json()
        throw new Error(d.error ?? 'Save failed')
      }
      // Auto-clear "Saved" after 2s
      setTimeout(() => setSaving(p => ({ ...p, [barberId]: false })), 2000)
    } catch (err) {
      setSaveError(p => ({ ...p, [barberId]: (err as Error).message }))
      setSaving(p => ({ ...p, [barberId]: false }))
    }
  }
```

- [ ] **Step 5: Add containerRefs**

Add a ref for drag container elements alongside the existing `inputRefs`:
```typescript
  const containerRefs = useRef<Record<string, HTMLDivElement | null>>({})
```

- [ ] **Step 6: Add the drag editor to the JSX**

Inside the barber map, after the `{/* Error */}` block and before the `{/* Hidden file input */}` block, add:

```tsx
              {/* Focus point editor — only when photo exists */}
              {barber.avatar_url && (
                <div className="flex flex-col items-center gap-1 mt-1 w-full">
                  <p className="text-secondary-400 text-xs text-center leading-tight">
                    Drag to adjust
                  </p>
                  {/* Circular drag viewport */}
                  <div
                    ref={el => { containerRefs.current[barber.id] = el }}
                    className="w-20 h-20 rounded-full overflow-hidden bg-secondary-700 cursor-grab active:cursor-grabbing select-none flex-shrink-0"
                    onMouseDown={e => {
                      const el = containerRefs.current[barber.id]
                      if (el) handleDragStart(e, barber.id, el)
                    }}
                    onMouseMove={handleDragMove}
                    onMouseUp={() => handleDragEnd(barber.id)}
                    onMouseLeave={() => handleDragEnd(barber.id)}
                    onTouchStart={e => {
                      const el = containerRefs.current[barber.id]
                      if (el) handleDragStart(e, barber.id, el)
                    }}
                    onTouchMove={handleDragMove}
                    onTouchEnd={() => handleDragEnd(barber.id)}
                  >
                    <img
                      src={barber.avatar_url}
                      alt=""
                      draggable={false}
                      className="w-full h-full object-cover pointer-events-none"
                      style={{
                        objectPosition: `${photoPos[barber.id]?.x ?? 50}% ${photoPos[barber.id]?.y ?? 50}%`,
                      }}
                    />
                  </div>
                  {/* Save feedback */}
                  {saving[barber.id] && (
                    <p className="text-emerald-400 text-xs">Saved</p>
                  )}
                  {saveError[barber.id] && (
                    <p className="text-red-400 text-xs text-center leading-tight">
                      {saveError[barber.id]}
                    </p>
                  )}
                </div>
              )}
```

- [ ] **Step 7: Verify in browser**

Run `npm run dev` and open the admin panel → Barber Photos section.
- Barbers with photos should show a circular drag editor below their upload button
- Dragging the photo in the circle should reposition it live
- Releasing the drag should show "Saved" briefly
- The TV display (`/tv-display` or wherever `BarberCard` is rendered) should update to reflect the new position on next load

- [ ] **Step 8: Commit**

```bash
git add src/app/admin/BarberPhotosPanel.tsx
git commit -m "feat: add drag-to-reposition photo focus point editor in admin panel"
```

---

## Task 6: Wire photoX/photoY Into BarberCard Callers

**Context:** `BarberCard` now accepts `photoX` and `photoY` props, but any component that renders `BarberCard` needs to pass those values in. Find all callers and update them.

- [ ] **Step 1: Find all BarberCard usages**

```bash
grep -r "BarberCard" "/Users/xvjosh/sharper image que/barber_scheduling/src" --include="*.tsx" -l
```

- [ ] **Step 2: For each caller, pass photo_x / photo_y**

For each file found, check if it fetches barber data that includes `photo_x` / `photo_y`. If the data comes from `/api/barbers` (which now returns these fields), add `photoX={barber.photo_x ?? 50}` and `photoY={barber.photo_y ?? 50}` to the `<BarberCard>` JSX.

If the props are omitted, `BarberCard` defaults to 50/50 — so this step is an improvement rather than a requirement. The component will still render correctly without them.

- [ ] **Step 3: Commit (if any changes were made)**

```bash
git add -p
git commit -m "feat: pass photo focus point to BarberCard from all callers"
```

---

## Task 7: Full Run — Tests + Manual Verification

- [ ] **Step 1: Run all tests**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npm run test
```
Expected: all tests pass (including the new `focusPoint` tests)

- [ ] **Step 2: Manual smoke test**

1. Open admin panel → Barber Photos
2. Find a barber with a photo
3. Drag the circular editor — photo repositions live
4. Release — "Saved" appears briefly
5. Open TV display — barber's card shows the repositioned photo
6. Reload the page — position is remembered (persisted in DB)
7. Barbers without photos: no editor shown (no regressions)
8. Live queue display: unchanged (FloorBarberCard untouched)
