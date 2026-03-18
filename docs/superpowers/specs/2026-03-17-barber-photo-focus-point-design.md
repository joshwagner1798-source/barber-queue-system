# Barber Photo Focus Point — Design Spec
**Date:** 2026-03-17

## Problem

Barber photos uploaded to the system are displayed with `object-cover object-top`, which pins the image to the top of the frame. When a photo is a full-body or group shot, the barber's face may not be visible in the card on the TV display. There is no way for admins to adjust the framing.

## Goal

Allow admins to drag-to-reposition each barber's photo directly in the admin settings panel, so the barber's face is properly framed on the TV display (`BarberCard`). The live queue display (`FloorBarberCard`) is unaffected.

---

## Scope

**In scope:**
- Drag-to-reposition editor in `BarberPhotosPanel` (admin panel)
- Persisted X/Y focal point per barber in the database
- `BarberCard` uses the stored focal point for `object-position`

**Out of scope:**
- `FloorBarberCard` — live queue photos look fine, left untouched
- Zoom / scale control
- Any other admin panel section

---

## Data Model

Add two nullable float columns to the `users` table:

```sql
ALTER TABLE users ADD COLUMN photo_x float DEFAULT 50;
ALTER TABLE users ADD COLUMN photo_y float DEFAULT 50;
```

- Values are percentages: `0` = left/top, `100` = right/bottom, `50` = center
- Default 50/50 (centered) for all existing and new barbers
- Delivered via a new Supabase migration file

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/<timestamp>_barber_photo_position.sql` | New migration adding `photo_x`, `photo_y` columns |
| `src/app/api/owner/barbers/[id]/route.ts` | Add `photo_x` and `photo_y` to `ALLOWED_FIELDS` set |
| `src/app/api/barbers/route.ts` | Add `photo_x, photo_y` to SELECT query |
| `src/app/admin/BarberPhotosPanel.tsx` | Add drag-to-reposition editor per barber |
| `src/components/BarberCard.tsx` | Replace `object-top` with dynamic `objectPosition` inline style |

**Untouched:** `FloorBarberCard.tsx`, `BarberManagementPanel.tsx`, `UISettingsPanel.tsx`, photo upload API, all other files.

---

## API Changes

### `GET /api/barbers`
Add `photo_x` and `photo_y` to the SELECT — both fields returned alongside existing `avatar_url`.

### `PATCH /api/owner/barbers/[id]`
Add `'photo_x'` and `'photo_y'` to the existing `ALLOWED_FIELDS` Set. No other logic changes.

---

## BarberPhotosPanel — Editor UI

Each barber card in the panel gains a drag-to-reposition editor **only when they have a photo** (`avatar_url` is non-null).

**Editor layout (per barber):**
1. Existing small circular preview (unchanged, sits above)
2. A larger circular drag zone (~80px diameter) showing the full photo behind it
   - The photo is absolutely positioned inside the circle, offset by the stored X/Y
   - User drags the photo; the circle acts as the viewport/mask
3. On mouse/touch release: PATCH `{ photo_x, photo_y }` to `/api/owner/barbers/[id]`
4. Inline "Saving…" / "Saved" text feedback, clears after 2s

**State per barber:**
- `photoPos: Record<string, { x: number; y: number }>` — current position
- `saving: Record<string, boolean>` — save indicator
- Loaded from `/api/barbers` alongside existing barber data (needs `photo_x`, `photo_y` added to that endpoint)

**Interaction:**
- `onMouseDown` / `onTouchStart` starts drag, records the cursor position and the current `(x, y)` values at that moment
- `onMouseMove` / `onTouchMove` computes a delta from the drag origin and adds it to the recorded `(x, y)` — this prevents the photo from snapping on first click (grab-and-drag feel, not cursor-tracks-center)
- Values are clamped to 0–100 after each move
- `onMouseUp` / `onTouchEnd` triggers save
- Drag only active when photo exists

---

## BarberCard — Display

Replace the hardcoded `object-top` Tailwind class with an inline style:

```tsx
// Before
className={`absolute inset-0 w-full h-full object-cover object-top${imageClassName ? ` ${imageClassName}` : ''}`}

// After
className={`absolute inset-0 w-full h-full object-cover${imageClassName ? ` ${imageClassName}` : ''}`}
style={{ objectPosition: `${photoX ?? 50}% ${photoY ?? 50}%` }}
```

`photoX` and `photoY` are new optional props (defaulting to 50) added to the `Props` interface.

---

## Error Handling

- If the PATCH fails, show an inline error message next to the barber's editor ("Save failed")
- If `photo_x` / `photo_y` are null (legacy rows), default to 50% in the display
- No disruption to existing upload flow

---

## What Is Not Changing

- Photo upload logic
- Live queue display (`FloorBarberCard`)
- Status badges, animations, countdown timers
- Any other admin panel sections
- Auth, Supabase Storage, or any infrastructure
