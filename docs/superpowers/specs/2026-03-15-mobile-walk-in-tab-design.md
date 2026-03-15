# Mobile Walk-In Tab — Design Spec
**Date:** 2026-03-15
**Status:** Approved

---

## Overview

Upgrade the "Kiosk" (Walk-In) tab at `/sharperimage/tv` from a plain text form into a live, mobile-optimized barber grid. Customers browsing on their phones see real-time barber availability, tap a card to open a glass overlay modal, then choose to either book via Acuity or hop into the walk-in queue.

The TV Display tab is untouched. Only the Walk-In tab content changes.

---

## Goals

1. Show live Acuity-backed barber availability on the Walk-In tab (same source of truth as TV display)
2. Show barber profile photos and status on mobile-optimized cards
3. Tapping a card opens a glass modal with two actions: "Book a Time" and "Hop in Queue"
4. "Book a Time" opens the barber's Acuity direct scheduling link in a new tab
5. "Hop in Queue" transitions to the existing walk-in form pre-filled with that barber

---

## Architecture

### Screen Flow (within the Walk-In tab)

```
Walk-In Tab
  └─ Screen 1: MobileQueue (barber grid)
       └─ tap card → BarberModal (glass overlay)
            ├─ "Book a Time" → opens Acuity URL (new tab)
            └─ "Hop in Queue" → Screen 2
  └─ Screen 2: KioskForm (pre-filled, existing component)
       └─ back button → Screen 1
```

### Components

| Component | Location | Purpose |
|-----------|----------|---------|
| `MobileQueue` | `src/app/tv-display/MobileQueue.tsx` | Manages two-screen state, fetches `/api/tv`, renders barber grid |
| `BarberMobileCard` | `src/components/BarberMobileCard.tsx` | Mobile barber card (photo, name, status) |
| `BarberModal` | `src/components/BarberModal.tsx` | Glass overlay modal (photo, status, two CTAs) |
| `KioskForm` | `src/app/kiosk/KioskForm.tsx` | Existing — add `initialBarberId` + `initialPreference` props |
| `TVDisplayTabs` | `src/app/tv-display/TVDisplayTabs.tsx` | Swap `<KioskForm>` for `<MobileQueue>` in kiosk tab |

---

## Data Flow

### Source of Truth
`MobileQueue` fetches `GET /api/tv?shop_id=` — the same Acuity-backed endpoint used by `FloorDisplay`. No new API route. No duplicate logic.

**Polling:** 30-second interval (not realtime subscriptions — sufficient for mobile browsing).

### `/api/tv` Change
Add `acuity_calendar_id` to the per-barber select and response shape:

```typescript
// Added to existing TVBarber response shape
acuity_calendar_id: string | null
```

### Booking URL Construction (client-side)
```typescript
const ACUITY_OWNER_ID = '13855243'
const bookingUrl = acuity_calendar_id
  ? `https://app.acuityscheduling.com/schedule.php?owner=${ACUITY_OWNER_ID}&calendarID=${acuity_calendar_id}`
  : null
```

If `acuity_calendar_id` is null, the "Book a Time" button is hidden.

### KioskForm Pre-fill
New optional props added to `KioskForm`:
```typescript
interface KioskFormProps {
  shopId?: string
  initialBarberId?: string       // pre-selects barber
  initialPreference?: 'ANY' | 'PREFERRED'  // sets toggle
}
```

---

## Component Specs

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

**Interaction:** `onClick` opens `BarberModal`

---

### BarberModal

**Backdrop:** Full-screen dark overlay (`bg-black/60 backdrop-blur-sm`), tap to close
**Panel:** Slides up from bottom with fade + scale animation, dark semi-transparent background (`bg-zinc-900/90`), `rounded-t-3xl`, soft shadow

**Content (top to bottom):**
1. Drag handle bar
2. Large barber photo (120px circle) or initials fallback
3. Barber name (large, bold, white)
4. Status badge (same color logic as card)
5. "Next opening: {free_at}" — shown only when `status === 'BUSY'`
6. Divider
7. **"Book a Time"** — primary CTA, full-width, amber/gold fill — `window.open(bookingUrl, '_blank')` — hidden if no `acuity_calendar_id`
8. **"Hop in Queue"** — secondary CTA, full-width, outlined white — transitions to `KioskForm` screen

**Close:** tap backdrop OR drag handle downward

---

### MobileQueue

**State:**
```typescript
type Screen = 'grid' | 'form'
interface SelectedBarber {
  id: string
  firstName: string
  lastName: string
  acuityCalendarId: string | null
}
```

**Behavior:**
- Fetches `/api/tv` on mount, polls every 30s
- Screen `'grid'`: renders `BarberMobileCard` list + `BarberModal` when one is selected
- Screen `'form'`: renders `<KioskForm initialBarberId={...} initialPreference="PREFERRED" />` + back button
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
| `src/app/api/tv/route.ts` | Add `acuity_calendar_id` to barber select + response |
| `src/app/tv-display/TVDisplayTabs.tsx` | Swap `<KioskForm>` → `<MobileQueue>` in kiosk tab |
| `src/app/tv-display/MobileQueue.tsx` | **New** — two-screen wrapper |
| `src/components/BarberMobileCard.tsx` | **New** — mobile card |
| `src/components/BarberModal.tsx` | **New** — glass modal |
| `src/app/kiosk/KioskForm.tsx` | Add `initialBarberId` + `initialPreference` props |

---

## Out of Scope

- TV Display tab: no changes
- Realtime subscriptions for mobile tab (polling is sufficient)
- Walk-in queue logic, SMS offer system: no changes
- Owner dashboard / admin panel: no changes
