# Mobile Walk-In Tab — Design Spec
**Date:** 2026-03-15
**Status:** Approved (revised — booking URL approach updated)

---

## Overview

Upgrade the "Kiosk" (Walk-In) tab at `/sharperimage/tv` from a plain text form into a live, mobile-optimized barber grid. Customers browsing on their phones see real-time barber availability, tap a card to open a glass overlay modal, then choose to either book via Acuity or hop into the walk-in queue.

The TV Display tab is untouched. Only the Walk-In tab content changes.

---

## Goals

1. Show live Acuity-backed barber availability on the Walk-In tab (same source of truth as TV display)
2. Show barber profile photos and status on mobile-optimized cards
3. Tapping a card opens a glass modal with two actions: "Book a Time" and "Hop in Queue"
4. "Book a Time" uses structured booking URL data — never constructed client-side
5. "Hop in Queue" transitions to the existing walk-in form pre-filled with that barber
6. A "First Available" card at the top uses the shop-level fallback booking URL

---

## Architecture

### Screen Flow (within the Walk-In tab)

```
Walk-In Tab
  └─ Screen 1: MobileQueue (barber grid)
       ├─ FirstAvailableCard (uses shop_booking_url; "Hop in Queue" → form with ANY)
       └─ BarberMobileCard (per barber)
            └─ tap → BarberModal (glass overlay)
                 ├─ "Book a Time" → direct_booking_url ?? shop_booking_url (new tab)
                 └─ "Hop in Queue" → Screen 2 (preferenceType=PREFERRED, initialBarberId=barber.id)
  └─ Screen 2: KioskForm (pre-filled, existing component)
       └─ back button → Screen 1
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `MobileQueue` | `src/app/tv-display/MobileQueue.tsx` | Manages two-screen state, fetches `/api/tv`, renders barber grid |
| `FirstAvailableCard` | `src/app/tv-display/FirstAvailableCard.tsx` | Distinct card for the "First Available" option |
| `BarberMobileCard` | `src/components/BarberMobileCard.tsx` | Mobile barber card (photo, name, status) |
| `BarberModal` | `src/components/BarberModal.tsx` | Glass overlay modal (photo, status, two CTAs) |
| `KioskForm` | `src/app/kiosk/KioskForm.tsx` | Existing — add `initialBarberId` + `initialPreference` props |
| `TVDisplayTabs` | `src/app/tv-display/TVDisplayTabs.tsx` | Swap `<KioskForm>` for `<MobileQueue>` in kiosk tab |

---

## Booking URL Strategy

There are two types of booking URLs. The client **never constructs Acuity URLs manually** — all links come from structured data returned by the API.

### 1. Per-barber direct booking URL
Stored in `users.direct_booking_url` (new nullable text column). Each barber's personal Acuity scheduling link. Set directly in the DB for now (no admin UI needed yet).

### 2. Shop-level fallback booking URL
Stored in `shop_settings.fallback_booking_url` (new nullable text column). The general shop/kiosk Acuity link. Used for:
- The "First Available" card ("Book a Time" and "Hop in Queue")
- Any barber where `direct_booking_url` is null

### Resolution order (per barber modal)
```
direct_booking_url ?? shop_booking_url ?? hide "Book a Time" button
```

### "First Available" card
Always uses `shop_booking_url`. "Hop in Queue" sends `preferenceType = 'ANY'` and `initialBarberId = undefined` to the KioskForm — no barber pre-selected. Appears as the first card above individual barber cards.

---

## Data Flow

### Source of Truth
`MobileQueue` fetches `GET /api/tv?shop_id=` — the same Acuity-backed endpoint used by `FloorDisplay`. No new API route. No duplicate logic.

**Polling:** 30-second interval (not realtime subscriptions — sufficient for mobile browsing).

### `/api/tv` Changes

**Per-barber response** — two new fields added to the existing users select:
```typescript
// users.direct_booking_url — per-barber Acuity link (new column, see migration 00018)
direct_booking_url: string | null

// users.walkin_enabled — whether barber accepts walk-ins
// This column may already exist on the live DB; if absent, default to true
walkin_eligible: boolean  // mapped from users.walkin_enabled ?? true
```

The `users` select in `/api/tv/route.ts` adds `direct_booking_url, walkin_enabled`. Both are columns directly on the `users` table (not on `calendar_connections`).

**Top-level response** — add `shop_booking_url`:
```typescript
// Added alongside barbers[], barber_statuses[], walkins[]
// Fetched from shop_settings.fallback_booking_url for the shop (new column, see migration 00018)
shop_booking_url: string | null
```

### New DB columns — Migration `00018`

| Table | Column | Type | Notes |
|-------|--------|------|-------|
| `users` | `direct_booking_url` | `text` nullable | Per-barber Acuity direct booking URL |
| `shop_settings` | `fallback_booking_url` | `text` nullable | Shop-level fallback Acuity booking URL. `shop_settings` is the correct table — defined in migration `00015`. |

Migration file: `supabase/migrations/00018_booking_urls.sql`

### KioskForm Pre-fill
New optional props added to `KioskForm`:
```typescript
interface KioskFormProps {
  shopId?: string
  initialBarberId?: string            // pre-selects barber; undefined = first available
  initialPreference?: 'ANY' | 'PREFERRED'  // sets toggle; undefined defaults to 'ANY'
}
```
When coming from a specific barber's modal: `initialBarberId = barber.id`, `initialPreference = 'PREFERRED'`.
When coming from "First Available" card: `initialBarberId = undefined`, `initialPreference = 'ANY'`.

---

## Component Specs

### FirstAvailableCard

A distinct full-width card (not `BarberMobileCard`) rendered first in the grid.

**Layout:**
- Left: scissors or store icon (or generic avatar circle with "✂" glyph), zinc-700 background
- Center: "First Available" (bold, white), subtitle "Whoever's ready for you" (zinc-400)
- Right: chevron

**Tap behavior:** Opens a simplified inline CTA area (no modal needed) or a lightweight modal variant:
- **"Book a Time"** — opens `shop_booking_url` in a new tab (hidden if `shop_booking_url` is null)
- **"Hop in Queue"** — transitions to Screen 2 with `initialBarberId = undefined`, `initialPreference = 'ANY'`

> Implementation choice: can use `BarberModal` with `isFirstAvailable={true}` prop (hides photo, shows store icon and generic name) or a self-contained inline card action. Either is acceptable — implementer's discretion. Modal approach reuses more code.

---

### BarberMobileCard

**Layout:** Full-width dark card, horizontally arranged
- Left: 64px circular photo (`object-cover`), initials fallback avatar if no `avatar_url`
- Center: barber name (bold, white), status line below
- Right: chevron icon indicating tappable

**Status text logic:**
| `/api/tv` status | Display text | Color |
|-----------------|-------------|-------|
| `FREE` | `Available Now` | emerald |
| `BUSY` + `busy_reason: 'appointment'` | `Ready at {free_at formatted HH:MM AM/PM}` | amber |
| `BUSY` + `busy_reason: 'blocked'` | `Unavailable until {blocked_until formatted}` | red |
| `UNAVAILABLE` | `Unavailable` | red |
| `OFF` | uses existing `off_label` field | zinc |

**`walkin_eligible` handling:**
When `walkin_eligible === false`, the card is still displayed and tappable, but no queue CTA appears on the card surface. In the modal, only "Book a Time" is shown. If `walkin_eligible` is absent from the API response, treat as `true`.

**Interaction:** `onClick` opens `BarberModal`

---

### BarberModal

**Backdrop:** Full-screen dark overlay (`bg-black/60 backdrop-blur-sm`), tap to close
**Panel:** Slides up from bottom with fade animation, dark semi-transparent background (`bg-zinc-900/90`), `rounded-t-3xl`, soft shadow

**Booking URL used:** `barber.direct_booking_url ?? shop_booking_url`

**Content (top to bottom):**
1. Drag handle bar
2. Large barber photo (120px circle) or initials fallback
3. Barber name (large, bold, white)
4. Status badge (same color logic as card)
5. "Next opening: {free_at formatted}" — shown only when `status === 'BUSY'`
6. Divider
7. **"Book a Time"** — primary CTA, full-width, amber/gold fill — `window.open(resolvedBookingUrl, '_blank')` — hidden if `resolvedBookingUrl` is null
8. **"Hop in Queue"** — secondary CTA, full-width, outlined white — transitions to KioskForm with `initialBarberId = barber.id`, `initialPreference = 'PREFERRED'` — **hidden when `walkin_eligible === false`**

**Close:** tap backdrop OR drag handle area

---

### MobileQueue

**State:**
```typescript
type Screen = 'grid' | 'form'

// Set at CTA tap time — not stored on barber object
interface QueueEntry {
  initialBarberId: string | undefined  // undefined = first available
  initialPreference: 'ANY' | 'PREFERRED'
}
```

**Behavior:**
- Fetches `/api/tv` on mount, polls every 30s
- Receives `shop_booking_url` from top-level API response
- Screen `'grid'`: renders `FirstAvailableCard` then `BarberMobileCard` list; `BarberModal` shown when a barber is selected
- Screen `'form'`: renders `<KioskForm initialBarberId={...} initialPreference={...} shopId={shopId} />` + back button
- Back button returns to `'grid'` and closes any open modal

---

## UX Details

- Cards use `active:scale-95` tap feedback
- Modal animation: `translateY(100%)` → `translateY(0)` on open, 250ms ease-out
- Initials fallback: first letter of first + last name, on a zinc-700 circle
- "Book a Time" button stands out (amber fill, prominent)
- "Hop in Queue" is full-width but outlined — visible but secondary
- Loading state: skeleton cards while `/api/tv` loads
- Error state: inline message if `/api/tv` fails

---

## Files Changed

| File | Change |
|------|--------|
| `supabase/migrations/00018_booking_urls.sql` | **New** — add `users.direct_booking_url`, `shop_settings.fallback_booking_url` |
| `src/app/api/tv/route.ts` | Add `direct_booking_url`, `walkin_enabled` to barber select; add `shop_booking_url` to top-level response |
| `src/app/tv-display/TVDisplayTabs.tsx` | Swap `<KioskForm>` → `<MobileQueue>` in kiosk tab |
| `src/app/tv-display/MobileQueue.tsx` | **New** — two-screen wrapper |
| `src/app/tv-display/FirstAvailableCard.tsx` | **New** — "First Available" card |
| `src/components/BarberMobileCard.tsx` | **New** — mobile barber card |
| `src/components/BarberModal.tsx` | **New** — glass overlay modal |
| `src/app/kiosk/KioskForm.tsx` | Add `initialBarberId` + `initialPreference` props |

---

## Out of Scope

- TV Display tab: no changes
- Realtime subscriptions for mobile tab (polling is sufficient)
- Walk-in queue logic, SMS offer system: no changes
- Owner dashboard UI for editing `direct_booking_url` per barber (set directly in DB for now)
- Admin panel: no changes
