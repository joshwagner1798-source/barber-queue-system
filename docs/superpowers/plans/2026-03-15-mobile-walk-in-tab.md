# Mobile Walk-In Tab Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the plain walk-in form in the Kiosk tab with a live mobile barber grid — cards showing real-time Acuity-backed status, a glass modal with "Book a Time" and "Hop in Queue" CTAs.

**Architecture:** The Kiosk tab in `TVDisplayTabs.tsx` is swapped from `<KioskForm>` to a new `<MobileQueue>` component that manages two screens: a barber grid (polling `/api/tv` every 30s) and the existing `KioskForm` pre-filled with a selected barber. Booking URLs come from structured DB fields — never constructed client-side.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Supabase (Postgres), Vitest (unit tests), Framer Motion (already installed)

**Spec:** `docs/superpowers/specs/2026-03-15-mobile-walk-in-tab-design.md`

---

## Chunk 1: DB Migration + API Changes

### Task 1: DB Migration — Add booking URL columns

**Files:**
- Create: `supabase/migrations/000NN_booking_urls.sql` (see Step 1 for how to determine NN)

Context: `shop_settings` table was created in migration 00015. The `users` table was created in 00001. Both just need new nullable text columns. No RLS changes needed — `users` and `shop_settings` already have policies.

- [ ] **Step 1: Determine the correct migration number**

The migration files on disk go up to `00016_barber_photos_bucket.sql`. However, the project memory documents that migrations 00017 (SMS offer system) and 00018 (PIN-protected dashboard) were applied to the live database but their files were never committed to the repo.

Check the live DB in the Supabase dashboard: go to **Database → Migrations** (or run `SELECT version FROM supabase_migrations.schema_migrations ORDER BY version DESC LIMIT 5;` in the SQL editor) to confirm the highest applied migration number. Name this file **one higher than that**.

If 00018 is the highest applied: name the file `00019_booking_urls.sql`.
If unsure: use `00019` — it is safe because `ADD COLUMN IF NOT EXISTS` is idempotent.

- [ ] **Step 2: Create the migration file**

```sql
-- supabase/migrations/00019_booking_urls.sql  (adjust number per Step 1)
-- Adds booking URL fields:
--   users.direct_booking_url         — per-barber Acuity scheduling link
--   shop_settings.fallback_booking_url — shop-level fallback Acuity link

ALTER TABLE users
  ADD COLUMN IF NOT EXISTS direct_booking_url text;

ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS fallback_booking_url text;
```

- [ ] **Step 3: Apply to your live Supabase project**

Run this SQL in the Supabase dashboard SQL editor. Verify the columns appear in the table editor for both `users` and `shop_settings`.

- [ ] **Step 4: Seed booking URLs directly in Supabase**

Before seeding, confirm you have each barber's personal Acuity scheduling page URL — these are different from the general shop link.

In the Supabase dashboard:
1. Open the `users` table, filter by `role = barber`, and set `direct_booking_url` for each active barber to their individual Acuity scheduling page link.
2. Open the `shop_settings` table. A row for the shop must already exist (it was created when the TV background was configured). Find the row with `shop_id = 70467794-c7ce-47f2-8c62-bcb5bb19e31e` and set `fallback_booking_url` to: `https://app.acuityscheduling.com/schedule.php?owner=13855243&calendarID=3180006`

If no `shop_settings` row exists for the shop yet, insert one:
```sql
INSERT INTO shop_settings (shop_id, fallback_booking_url)
VALUES ('70467794-c7ce-47f2-8c62-bcb5bb19e31e', 'https://app.acuityscheduling.com/schedule.php?owner=13855243&calendarID=3180006')
ON CONFLICT (shop_id) DO UPDATE SET fallback_booking_url = EXCLUDED.fallback_booking_url;
```

- [ ] **Step 5: Commit the migration file**

```bash
git add supabase/migrations/00019_booking_urls.sql   # use your actual filename
git commit -m "feat(db): add direct_booking_url to users, fallback_booking_url to shop_settings"
```

---

### Task 2: Update `/api/tv` — add booking URLs + walkin_eligible to response

**Files:**
- Modify: `src/app/api/tv/route.ts`

Context: The route currently selects `'id, first_name, last_name, avatar_url, display_order'` from `users` and returns `{ barber_statuses, walkins, barbers }`. We need to:
1. Add `direct_booking_url, walkin_enabled` to the `users` select
2. Fetch `shop_settings.fallback_booking_url` for the shop
3. Include both in the response

The `shop_settings` fetch must be scoped to the correct `shop_id`. Note: `/api/shop-settings/route.ts` hardcodes the shop ID — **do not copy that pattern**. Use the `shopId` resolved by `requireShopId(request)`.

**Important — use the `admin` client for the `shop_settings` fetch.** The `shop_settings` RLS policy only allows owners/admins authenticated via `auth.uid()`. The `admin` (service role) client bypasses RLS and is already used for all other queries in this route. Do NOT use the anon client here — it will silently return null.

- [ ] **Step 1: Update the `users` select and add `shop_settings` fetch**

In `src/app/api/tv/route.ts`, find the `Promise.all([...])` block (lines 35–99). Add a new fetch at the end of the array:

```typescript
// Add to the destructured result names at the top of Promise.all:
shopSettingsResult,

// Add as the last item inside Promise.all([...]):
admin
  .from('shop_settings')
  .select('fallback_booking_url')
  .eq('shop_id', shopId)
  .maybeSingle(),
```

Also update the `users` select from:
```typescript
.select('id, first_name, last_name, avatar_url, display_order')
```
to:
```typescript
.select('id, first_name, last_name, avatar_url, display_order, direct_booking_url, walkin_enabled')
```

- [ ] **Step 2: Update the local `BarberRow` type alias and barber mapping**

`BarberRow` is a local `type` alias defined inside the `GET` handler (around line 105 of `route.ts`) — it is not a shared exported type. Update it in place:

```typescript
type BarberRow = {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  display_order: number
  direct_booking_url: string | null
  walkin_enabled: boolean | null  // raw DB column name
}
```

In the `.map((barber) => { ... })` block, add the two new output fields. Note: the response exposes `walkin_eligible` (not `walkin_enabled`) — map it explicitly and do NOT spread `walkin_enabled` into the output:

```typescript
return {
  ...barber,
  status,
  busy_reason,
  free_at,
  blocked_until,
  blocked_note,
  next_appt_at,
  next_client_name,
  off_label,
  off_until_at,
  direct_booking_url: barber.direct_booking_url ?? null,
  walkin_eligible: barber.walkin_enabled ?? true,  // map DB column → response field; default true
  // walkin_enabled is intentionally NOT included in the response
}
```

- [ ] **Step 3: Add `shop_booking_url` to the top-level response**

After the `Promise.all` resolves, extract the shop booking URL:

```typescript
type ShopSettingsRow = { fallback_booking_url: string | null }
const shopBookingUrl =
  (shopSettingsResult.data as ShopSettingsRow | null)?.fallback_booking_url ?? null
```

Update the final `return NextResponse.json(...)`:

```typescript
return NextResponse.json({
  barber_statuses: statusResult.data ?? [],
  walkins:         walkinsResult.data ?? [],
  barbers,
  shop_booking_url: shopBookingUrl,
})
```

- [ ] **Step 4: Verify manually**

Start the dev server (`npm run dev`) and open:
```
http://localhost:3000/api/tv?shop_id=70467794-c7ce-47f2-8c62-bcb5bb19e31e
```

Confirm the JSON response includes:
- `shop_booking_url` at the top level (string or null)
- Each barber object has `direct_booking_url` and `walkin_eligible` fields

- [ ] **Step 5: Commit**

```bash
git add src/app/api/tv/route.ts
git commit -m "feat(api): add direct_booking_url, walkin_eligible per barber and shop_booking_url to /api/tv"
```

---

## Chunk 2: KioskForm Props + Status Utility

### Task 3: Add `initialBarberId` and `initialPreference` props to `KioskForm`

**Files:**
- Modify: `src/app/kiosk/KioskForm.tsx`

Context: `KioskForm` currently has a single prop `shopId?: string`. We need two new optional props so that `MobileQueue` can pre-fill the barber selection when the user taps "Hop in Queue" from a barber's modal.

- [ ] **Step 1: Update `KioskFormProps` interface**

Find the `interface KioskFormProps` at the top of the component (around line 11). Update it:

```typescript
interface KioskFormProps {
  shopId?: string
  initialBarberId?: string
  initialPreference?: 'ANY' | 'PREFERRED'
}
```

- [ ] **Step 2: Apply initial values to state**

Update the function signature and the two `useState` calls that set preference type and barber ID:

```typescript
export function KioskForm({ shopId, initialBarberId, initialPreference }: KioskFormProps) {
```

Change:
```typescript
const [preferenceType, setPreferenceType] = useState<'ANY' | 'PREFERRED'>('ANY')
const [preferredBarberId, setPreferredBarberId] = useState<string | null>(null)
```
To:
```typescript
const [preferenceType, setPreferenceType] = useState<'ANY' | 'PREFERRED'>(initialPreference ?? 'ANY')
const [preferredBarberId, setPreferredBarberId] = useState<string | null>(initialBarberId ?? null)
```

- [ ] **Step 3: Note on form reset behavior**

`KioskForm` has a `resetToForm` callback (around line 49) that resets all state including `preferenceType` back to `'ANY'` and `preferredBarberId` back to `null` — it does NOT re-read `initialBarberId`/`initialPreference`. This is intentional: once the customer submits the form or navigates away, the form should reset to a neutral state. The 30-second auto-reset will clear the pre-fill, which is acceptable because the customer will have already submitted by then. No code change needed here.

- [ ] **Step 4: Verify manually**

No automated test needed here — the change is trivial useState initialization. Verify later when `MobileQueue` renders the form: the barber dropdown should show the pre-selected barber and "Preferred Barber" toggle should be active.

- [ ] **Step 4: Commit**

```bash
git add src/app/kiosk/KioskForm.tsx
git commit -m "feat(kiosk): add initialBarberId and initialPreference props to KioskForm"
```

---

### Task 4: Create status text utility (pure logic, unit tested)

**Files:**
- Create: `src/lib/mobile-queue/status.ts`
- Create: `src/lib/mobile-queue/__tests__/status.test.ts`

Context: The status text shown on barber cards ("Available Now", "Ready at 2:45 PM", etc.) is derived from the `/api/tv` barber object. This is pure logic — extract it into a tested utility so `BarberMobileCard` and `BarberModal` both import it without duplicating conditionals.

**Important — blocked barber status mapping:** The `/api/tv` route returns `status: 'UNAVAILABLE'` (not `'BUSY'`) when a barber is blocked. The spec table says `BUSY + busy_reason: 'blocked'` → "Unavailable until {time}" — but in the actual API response, blocked barbers always have `status: 'UNAVAILABLE'`. Implement the utility against the real API shape: `UNAVAILABLE + busy_reason: 'blocked' + blocked_until` → "Unavailable until {time}". `UNAVAILABLE` without a blocked reason → plain "Unavailable".

The `/api/tv` response fields used:
- `status: 'BUSY' | 'FREE' | 'UNAVAILABLE' | 'OFF'`
- `busy_reason: 'appointment' | 'blocked' | null`
- `free_at: string | null` — ISO timestamp when free (appointment end time)
- `blocked_until: string | null` — ISO timestamp when block ends
- `off_label: string | null` — pre-formatted string like "Off until Wed 10:20 AM"

- [ ] **Step 1: Write the failing tests first**

Create `src/lib/mobile-queue/__tests__/status.test.ts`:

```typescript
import { describe, it, expect } from 'vitest'
import { getBarberStatusText, getBarberStatusColor } from '../status'

// Helper: build a barber-like object with defaults
function barber(overrides: Record<string, unknown>) {
  return {
    status: 'FREE',
    busy_reason: null,
    free_at: null,
    blocked_until: null,
    off_label: null,
    ...overrides,
  }
}

describe('getBarberStatusText', () => {
  it('returns "Available Now" when FREE', () => {
    expect(getBarberStatusText(barber({ status: 'FREE' }))).toBe('Available Now')
  })

  it('returns "Ready at HH:MM AM/PM" when BUSY with appointment', () => {
    const freeAt = '2026-03-15T19:45:00.000Z'
    const result = getBarberStatusText(barber({ status: 'BUSY', busy_reason: 'appointment', free_at: freeAt }))
    // Exact time depends on timezone — just verify shape
    expect(result).toMatch(/^Ready at \d/)
  })

  it('returns "Unavailable until HH:MM" when UNAVAILABLE with blocked_until', () => {
    // API returns status='UNAVAILABLE' + busy_reason='blocked' for blocked barbers
    const blockedUntil = '2026-03-15T20:00:00.000Z'
    const result = getBarberStatusText(barber({ status: 'UNAVAILABLE', busy_reason: 'blocked', blocked_until: blockedUntil }))
    expect(result).toMatch(/^Unavailable until \d/)
  })

  it('returns plain "Unavailable" when UNAVAILABLE without blocked reason', () => {
    expect(getBarberStatusText(barber({ status: 'UNAVAILABLE', busy_reason: null }))).toBe('Unavailable')
  })

  it('returns off_label string when OFF', () => {
    expect(getBarberStatusText(barber({ status: 'OFF', off_label: 'Off until Wed 10:20 AM' }))).toBe('Off until Wed 10:20 AM')
  })

  it('returns "Off" when OFF but off_label is null', () => {
    expect(getBarberStatusText(barber({ status: 'OFF', off_label: null }))).toBe('Off')
  })
})

describe('getBarberStatusColor', () => {
  it('returns emerald for FREE', () => {
    expect(getBarberStatusColor('FREE')).toBe('emerald')
  })

  it('returns amber for BUSY', () => {
    expect(getBarberStatusColor('BUSY')).toBe('amber')
  })

  it('returns red for UNAVAILABLE', () => {
    expect(getBarberStatusColor('UNAVAILABLE')).toBe('red')
  })

  it('returns zinc for OFF', () => {
    expect(getBarberStatusColor('OFF')).toBe('zinc')
  })
})
```

- [ ] **Step 2: Run tests — verify they fail**

```bash
npx vitest run src/lib/mobile-queue/__tests__/status.test.ts
```

Expected: error like `Cannot find module '../status'`

- [ ] **Step 3: Implement the utility**

Create `src/lib/mobile-queue/status.ts`:

```typescript
const timeFmt = new Intl.DateTimeFormat('en-US', {
  timeZone: 'America/New_York',
  hour: 'numeric',
  minute: '2-digit',
  hour12: true,
})

export interface BarberStatusInput {
  status: string
  busy_reason?: string | null
  free_at?: string | null
  blocked_until?: string | null
  off_label?: string | null
}

export function getBarberStatusText(barber: BarberStatusInput): string {
  if (barber.status === 'FREE') return 'Available Now'

  if (barber.status === 'BUSY' && barber.busy_reason === 'appointment' && barber.free_at) {
    return `Ready at ${timeFmt.format(new Date(barber.free_at))}`
  }

  // API returns UNAVAILABLE (not BUSY) for blocked barbers
  if (barber.status === 'UNAVAILABLE' && barber.busy_reason === 'blocked' && barber.blocked_until) {
    return `Unavailable until ${timeFmt.format(new Date(barber.blocked_until))}`
  }

  if (barber.status === 'UNAVAILABLE' || barber.status === 'BUSY') {
    return 'Unavailable'
  }

  if (barber.status === 'OFF') {
    return barber.off_label ?? 'Off'
  }

  return 'Unavailable'
}

export type StatusColor = 'emerald' | 'amber' | 'red' | 'zinc'

export function getBarberStatusColor(status: string): StatusColor {
  switch (status) {
    case 'FREE':        return 'emerald'
    case 'BUSY':        return 'amber'
    case 'UNAVAILABLE': return 'red'
    case 'OFF':         return 'zinc'
    default:            return 'zinc'
  }
}
```

- [ ] **Step 4: Run tests — verify they pass**

```bash
npx vitest run src/lib/mobile-queue/__tests__/status.test.ts
```

Expected: all tests pass

- [ ] **Step 5: Commit**

```bash
git add src/lib/mobile-queue/status.ts src/lib/mobile-queue/__tests__/status.test.ts
git commit -m "feat(lib): add mobile-queue status text/color utility with tests"
```

---

## Chunk 3: UI Components

### Task 5: `BarberMobileCard` component

**Files:**
- Create: `src/components/BarberMobileCard.tsx`

Context: This is a full-width tappable card. It renders a 64px circular photo (or initials fallback), the barber's name, and their live status. No queue CTA on the card surface — that lives in the modal. The card calls `onClick` when tapped.

Status text and color come from the `src/lib/mobile-queue/status.ts` utility created in Task 4.

- [ ] **Step 1: Create the component**

```typescript
// src/components/BarberMobileCard.tsx
'use client'

import Image from 'next/image'
import { getBarberStatusText, getBarberStatusColor } from '@/lib/mobile-queue/status'

interface Props {
  firstName: string
  lastName: string
  avatarUrl: string | null
  status: string
  busyReason?: string | null
  freeAt?: string | null
  blockedUntil?: string | null
  offLabel?: string | null
  onClick: () => void
}

const colorClasses: Record<string, string> = {
  emerald: 'text-emerald-400',
  amber:   'text-amber-400',
  red:     'text-red-400',
  zinc:    'text-zinc-400',
}

export function BarberMobileCard({
  firstName,
  lastName,
  avatarUrl,
  status,
  busyReason,
  freeAt,
  blockedUntil,
  offLabel,
  onClick,
}: Props) {
  const initials   = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const statusText = getBarberStatusText({ status, busy_reason: busyReason, free_at: freeAt, blocked_until: blockedUntil, off_label: offLabel })
  const color      = getBarberStatusColor(status)

  return (
    <button
      onClick={onClick}
      className="w-full flex items-center gap-4 bg-zinc-900 border border-zinc-800 rounded-2xl px-4 py-3 text-left active:scale-95 transition-transform"
    >
      {/* Photo / initials */}
      <div className="relative flex-shrink-0 w-14 h-14 rounded-full overflow-hidden bg-zinc-700 flex items-center justify-center">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={`${firstName} ${lastName}`}
            fill
            className="object-cover"
            sizes="56px"
          />
        ) : (
          <span className="text-lg font-bold text-zinc-300">{initials}</span>
        )}
      </div>

      {/* Name + status */}
      <div className="flex-1 min-w-0">
        <p className="font-semibold text-white truncate">{firstName} {lastName}</p>
        <p className={`text-sm ${colorClasses[color] ?? 'text-zinc-400'}`}>{statusText}</p>
      </div>

      {/* Chevron */}
      <svg className="w-5 h-5 text-zinc-600 flex-shrink-0" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </button>
  )
}
```

- [ ] **Step 2: Verify visually**

This is a UI component with no automated tests. Verify in the browser after Task 8 wires everything up. At this stage just confirm the file compiles without TypeScript errors:

```bash
npx tsc --noEmit
```

Expected: no errors in `src/components/BarberMobileCard.tsx`

- [ ] **Step 3: Commit**

```bash
git add src/components/BarberMobileCard.tsx
git commit -m "feat(ui): add BarberMobileCard component"
```

---

### Task 6: `BarberModal` — glass overlay with booking CTAs

**Files:**
- Create: `src/components/BarberModal.tsx`

Context: This is the bottom-sheet modal that appears when a barber card is tapped. It slides up from the bottom with a dark blur backdrop. Contains a large barber photo, name, status, and two buttons:
- "Book a Time" — opens `direct_booking_url ?? shop_booking_url` in a new tab; hidden if both are null
- "Hop in Queue" — calls `onQueue()` prop; disabled with "Walk-ins unavailable" note when `walkinEligible === false`

Framer Motion is already installed (`framer-motion ^12.34.3`).

- [ ] **Step 1: Create the component**

```typescript
// src/components/BarberModal.tsx
'use client'

import Image from 'next/image'
import { motion, AnimatePresence } from 'framer-motion'
import { getBarberStatusText, getBarberStatusColor } from '@/lib/mobile-queue/status'

interface Props {
  isOpen: boolean
  onClose: () => void
  onQueue: () => void
  firstName: string
  lastName: string
  avatarUrl: string | null
  status: string
  busyReason?: string | null
  freeAt?: string | null
  blockedUntil?: string | null
  offLabel?: string | null
  walkinEligible: boolean
  directBookingUrl: string | null
  shopBookingUrl: string | null
}

const statusColorClasses: Record<string, string> = {
  emerald: 'text-emerald-400 bg-emerald-400/10',
  amber:   'text-amber-400 bg-amber-400/10',
  red:     'text-red-400 bg-red-400/10',
  zinc:    'text-zinc-400 bg-zinc-400/10',
}

export function BarberModal({
  isOpen,
  onClose,
  onQueue,
  firstName,
  lastName,
  avatarUrl,
  status,
  busyReason,
  freeAt,
  blockedUntil,
  offLabel,
  walkinEligible,
  directBookingUrl,
  shopBookingUrl,
}: Props) {
  const initials    = `${firstName[0] ?? ''}${lastName[0] ?? ''}`.toUpperCase()
  const statusText  = getBarberStatusText({ status, busy_reason: busyReason, free_at: freeAt, blocked_until: blockedUntil, off_label: offLabel })
  const color       = getBarberStatusColor(status)
  const resolvedUrl = directBookingUrl ?? shopBookingUrl

  const timeFmt = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  })
  const nextOpening = (status === 'BUSY' && freeAt)
    ? `Next opening: ${timeFmt.format(new Date(freeAt))}`
    : null

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            className="fixed inset-x-0 bottom-0 z-50 bg-zinc-900/95 rounded-t-3xl shadow-2xl border-t border-zinc-800 pb-safe"
            initial={{ y: '100%' }}
            animate={{ y: 0 }}
            exit={{ y: '100%' }}
            transition={{ type: 'spring', damping: 30, stiffness: 300 }}
          >
            {/* Drag handle */}
            <div className="flex justify-center pt-3 pb-1">
              <div className="w-10 h-1 rounded-full bg-zinc-700" />
            </div>

            <div className="flex flex-col items-center px-6 pb-8 pt-4 gap-4">
              {/* Photo — 120px per spec */}
              <div className="relative w-[120px] h-[120px] rounded-full overflow-hidden bg-zinc-700 flex items-center justify-center flex-shrink-0">
                {avatarUrl ? (
                  <Image
                    src={avatarUrl}
                    alt={`${firstName} ${lastName}`}
                    fill
                    className="object-cover"
                    sizes="120px"
                  />
                ) : (
                  <span className="text-3xl font-bold text-zinc-300">{initials}</span>
                )}
              </div>

              {/* Name */}
              <h2 className="text-2xl font-bold text-white">{firstName} {lastName}</h2>

              {/* Status badge */}
              <span className={`text-sm font-semibold px-3 py-1 rounded-full ${statusColorClasses[color] ?? statusColorClasses.zinc}`}>
                {statusText}
              </span>

              {/* Next opening */}
              {nextOpening && (
                <p className="text-sm text-zinc-400">{nextOpening}</p>
              )}

              <hr className="w-full border-zinc-800" />

              {/* Book a Time */}
              {resolvedUrl && (
                <a
                  href={resolvedUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-lg py-4 rounded-xl text-center transition-colors block"
                >
                  Book a Time
                </a>
              )}

              {/* Hop in Queue */}
              <div className="w-full">
                <button
                  onClick={walkinEligible ? onQueue : undefined}
                  disabled={!walkinEligible}
                  className={`w-full border-2 font-semibold text-lg py-4 rounded-xl transition-colors ${
                    walkinEligible
                      ? 'border-white text-white hover:bg-white/10'
                      : 'border-zinc-700 text-zinc-600 cursor-not-allowed'
                  }`}
                >
                  Hop in Queue
                </button>
                {!walkinEligible && (
                  <p className="text-center text-xs text-zinc-500 mt-2">Walk-ins unavailable</p>
                )}
              </div>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/components/BarberModal.tsx
git commit -m "feat(ui): add BarberModal glass overlay component with Book/Queue CTAs"
```

---

### Task 7: `FirstAvailableCard` component

**Files:**
- Create: `src/app/tv-display/FirstAvailableCard.tsx`

Context: This is a distinct card (not `BarberMobileCard`) that always appears first in the grid. It represents "whoever's ready for you." Tapping it shows two inline CTAs — "Book a Time" (uses `shopBookingUrl`) and "Hop in Queue" (launches the form with `preferenceType = 'ANY'`). Rather than opening a separate modal, the CTAs are shown inline below the card — simpler UX since there's no barber-specific detail to show.

- [ ] **Step 1: Create the component**

```typescript
// src/app/tv-display/FirstAvailableCard.tsx
'use client'

import { useState } from 'react'

interface Props {
  shopBookingUrl: string | null
  onQueue: () => void
}

export function FirstAvailableCard({ shopBookingUrl, onQueue }: Props) {
  const [expanded, setExpanded] = useState(false)

  return (
    <div className="w-full bg-zinc-800 border border-zinc-700 rounded-2xl overflow-hidden">
      {/* Card header — always visible, tappable */}
      <button
        onClick={() => setExpanded((v) => !v)}
        className="w-full flex items-center gap-4 px-4 py-3 text-left active:scale-95 transition-transform"
      >
        {/* Icon circle */}
        <div className="flex-shrink-0 w-14 h-14 rounded-full bg-zinc-700 flex items-center justify-center text-2xl">
          ✂️
        </div>

        <div className="flex-1 min-w-0">
          <p className="font-semibold text-white">First Available</p>
          <p className="text-sm text-zinc-400">Whoever&apos;s ready for you</p>
        </div>

        <svg
          className={`w-5 h-5 text-zinc-500 flex-shrink-0 transition-transform ${expanded ? 'rotate-90' : ''}`}
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
        </svg>
      </button>

      {/* Expanded CTAs */}
      {expanded && (
        <div className="flex flex-col gap-3 px-4 pb-4">
          {shopBookingUrl && (
            <a
              href={shopBookingUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="w-full bg-amber-500 hover:bg-amber-400 text-black font-bold text-base py-3 rounded-xl text-center transition-colors block"
            >
              Book a Time
            </a>
          )}
          <button
            onClick={onQueue}
            className="w-full border-2 border-white text-white font-semibold text-base py-3 rounded-xl hover:bg-white/10 transition-colors"
          >
            Hop in Queue
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/tv-display/FirstAvailableCard.tsx
git commit -m "feat(ui): add FirstAvailableCard component"
```

---

## Chunk 4: MobileQueue + Wiring

### Task 8: `MobileQueue` — two-screen state wrapper

**Files:**
- Create: `src/app/tv-display/MobileQueue.tsx`

Context: This is the top-level component for the Walk-In tab. It:
1. Fetches `/api/tv?shop_id=` on mount and every 30s
2. Screen `'grid'`: shows `FirstAvailableCard` + a list of `BarberMobileCard` components, with `BarberModal` overlaid when one is selected
3. Screen `'form'`: shows the existing `KioskForm` with `initialBarberId` and `initialPreference` pre-set, plus a back button

The `/api/tv` response shape (after Task 2) is:
```typescript
{
  barbers: Array<{
    id: string
    first_name: string
    last_name: string
    avatar_url: string | null
    status: string
    busy_reason: string | null
    free_at: string | null
    off_label: string | null
    direct_booking_url: string | null
    walkin_eligible: boolean
    // ...other fields not needed here
  }>
  shop_booking_url: string | null
  barber_statuses: unknown[]
  walkins: unknown[]
}
```

- [ ] **Step 1: Create the component**

```typescript
// src/app/tv-display/MobileQueue.tsx
'use client'

import { useState, useEffect, useCallback } from 'react'
import { BarberMobileCard } from '@/components/BarberMobileCard'
import { BarberModal } from '@/components/BarberModal'
import { FirstAvailableCard } from './FirstAvailableCard'
import { KioskForm } from '@/app/kiosk/KioskForm'

interface TVBarber {
  id: string
  first_name: string
  last_name: string
  avatar_url: string | null
  status: string
  busy_reason: string | null
  free_at: string | null
  blocked_until: string | null
  off_label: string | null
  direct_booking_url: string | null
  walkin_eligible: boolean
}

interface TVResponse {
  barbers: TVBarber[]
  shop_booking_url: string | null
}

interface QueueEntry {
  initialBarberId: string | undefined
  initialPreference: 'ANY' | 'PREFERRED'
}

interface Props {
  shopId: string
}

export function MobileQueue({ shopId }: Props) {
  const [barbers, setBarbers] = useState<TVBarber[]>([])
  const [shopBookingUrl, setShopBookingUrl] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const [selectedBarber, setSelectedBarber] = useState<TVBarber | null>(null)
  const [screen, setScreen] = useState<'grid' | 'form'>('grid')
  const [queueEntry, setQueueEntry] = useState<QueueEntry | null>(null)

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/tv?shop_id=${encodeURIComponent(shopId)}`)
      if (!res.ok) throw new Error(`/api/tv returned ${res.status}`)
      const data: TVResponse = await res.json()
      setBarbers(data.barbers ?? [])
      setShopBookingUrl(data.shop_booking_url ?? null)
      setError(null)
    } catch (err) {
      setError('Unable to load barber availability. Please try again.')
      console.error('[MobileQueue] fetch error:', err)
    } finally {
      setLoading(false)
    }
  }, [shopId])

  useEffect(() => {
    fetchData()
    const interval = setInterval(fetchData, 30_000)
    return () => clearInterval(interval)
  }, [fetchData])

  const handleHopInQueue = (entry: QueueEntry) => {
    setSelectedBarber(null)
    setQueueEntry(entry)
    setScreen('form')
  }

  const handleBack = () => {
    setScreen('grid')
    setQueueEntry(null)
  }

  // ── Form screen ────────────────────────────────────────────────────────────
  if (screen === 'form' && queueEntry) {
    return (
      <div className="min-h-full flex flex-col">
        <button
          onClick={handleBack}
          className="flex items-center gap-2 text-zinc-400 hover:text-white text-sm px-4 pt-4 pb-2 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" strokeWidth={2} viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
          </svg>
          Back
        </button>

        <div className="flex-1 flex items-center justify-center p-4">
          <KioskForm
            shopId={shopId}
            initialBarberId={queueEntry.initialBarberId}
            initialPreference={queueEntry.initialPreference}
          />
        </div>
      </div>
    )
  }

  // ── Grid screen ────────────────────────────────────────────────────────────
  return (
    <div className="min-h-full px-4 py-6 space-y-3">
      <h2 className="text-white font-bold text-xl mb-4">Who do you want?</h2>

      {loading && (
        <div className="space-y-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="w-full h-20 bg-zinc-800 rounded-2xl animate-pulse" />
          ))}
        </div>
      )}

      {error && (
        <p className="text-red-400 text-sm text-center py-4">{error}</p>
      )}

      {!loading && !error && (
        <>
          <FirstAvailableCard
            shopBookingUrl={shopBookingUrl}
            onQueue={() => handleHopInQueue({ initialBarberId: undefined, initialPreference: 'ANY' })}
          />

          {barbers.map((barber) => (
            <BarberMobileCard
              key={barber.id}
              firstName={barber.first_name}
              lastName={barber.last_name}
              avatarUrl={barber.avatar_url}
              status={barber.status}
              busyReason={barber.busy_reason}
              freeAt={barber.free_at}
              blockedUntil={barber.blocked_until}
              offLabel={barber.off_label}
              onClick={() => setSelectedBarber(barber)}
            />
          ))}
        </>
      )}

      {/* Modal */}
      {selectedBarber && (
        <BarberModal
          isOpen={true}
          onClose={() => setSelectedBarber(null)}
          onQueue={() => handleHopInQueue({
            initialBarberId: selectedBarber.id,
            initialPreference: 'PREFERRED',
          })}
          firstName={selectedBarber.first_name}
          lastName={selectedBarber.last_name}
          avatarUrl={selectedBarber.avatar_url}
          status={selectedBarber.status}
          busyReason={selectedBarber.busy_reason}
          freeAt={selectedBarber.free_at}
          blockedUntil={selectedBarber.blocked_until}
          offLabel={selectedBarber.off_label}
          walkinEligible={selectedBarber.walkin_eligible}
          directBookingUrl={selectedBarber.direct_booking_url}
          shopBookingUrl={shopBookingUrl}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/tv-display/MobileQueue.tsx
git commit -m "feat(ui): add MobileQueue two-screen component"
```

---

### Task 9: Wire `MobileQueue` into `TVDisplayTabs`

**Files:**
- Modify: `src/app/tv-display/TVDisplayTabs.tsx`

Context: The `kiosk` tab currently renders `<KioskForm shopId={shopId} />` inside a background div. Replace that with `<MobileQueue shopId={shopId} />`. The background and overlay styling wrapping it can be removed — `MobileQueue` handles its own dark styling.

- [ ] **Step 1: Update the import and kiosk tab content**

In `src/app/tv-display/TVDisplayTabs.tsx`:

Replace:
```typescript
import { KioskForm } from '@/app/kiosk/KioskForm'
```
With:
```typescript
import { MobileQueue } from './MobileQueue'
```

Replace the entire `{activeTab === 'kiosk' && (` block:

```typescript
{activeTab === 'kiosk' && (
  <div className="min-h-full bg-zinc-950">
    <MobileQueue shopId={shopId} />
  </div>
)}
```

- [ ] **Step 2: Check TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/tv-display/TVDisplayTabs.tsx
git commit -m "feat: wire MobileQueue into TVDisplayTabs kiosk tab"
```

---

### Task 10: Full end-to-end smoke test

- [ ] **Step 1: Start dev server**

```bash
npm run dev
```

- [ ] **Step 2: Open the Walk-In tab on mobile viewport**

Navigate to `http://localhost:3000/sharperimage/tv` in Chrome DevTools with a mobile viewport (e.g. iPhone 14 — 390px wide). Click the **"Kiosk"** tab.

Expected:
- "Who do you want?" heading
- "First Available" card at top with ✂️ icon
- One card per active barber with their photo (or initials), name, and status text ("Available Now", "Ready at X:XX PM", etc.)
- Cards match live Acuity status — not hardcoded

- [ ] **Step 3: Tap a barber card**

Expected:
- Dark backdrop appears with blur
- Modal slides up from the bottom
- Shows barber photo (or initials), name, status badge
- "Book a Time" button visible and amber-colored (if `direct_booking_url` is set in DB)
- "Hop in Queue" button visible, white outlined
- Tapping backdrop closes modal

- [ ] **Step 4: Test "Book a Time"**

Expected: opens the barber's Acuity scheduling page in a new tab

- [ ] **Step 5: Test "Hop in Queue" for a walk-in-eligible barber**

Expected:
- Modal closes
- Screen transitions to the walk-in form
- Barber is pre-selected in the dropdown
- "Preferred Barber" toggle is active
- "Back" button returns to the barber grid

- [ ] **Step 6: Test "First Available" → "Hop in Queue"**

Expected:
- Form loads with "First Available" toggle active (no barber pre-selected)

- [ ] **Step 7: Test a barber with `walkin_eligible = false`**

Set `walkin_enabled = false` for one barber in the Supabase `users` table. Reload the page and tap that barber's card.

Expected:
- Modal shows "Hop in Queue" button grayed out and non-interactive
- "Walk-ins unavailable" note visible below the button
- "Book a Time" still works normally

- [ ] **Step 8: Verify 30-second polling**

While on the grid screen, open the Network tab in DevTools and watch for requests to `/api/tv`. Confirm a new request fires approximately every 30 seconds without any user interaction. You can also manually change a barber's `walkin_enabled` in Supabase and wait 30s — the card should update without a page reload.

- [ ] **Step 9: Run all unit tests**

```bash
npm test
```

Expected: all tests pass including the new status utility tests

- [ ] **Step 10: Final commit and push**

```bash
git push
```

---

## Summary of Files

| File | Status |
|------|--------|
| `supabase/migrations/00018_booking_urls.sql` | New |
| `src/app/api/tv/route.ts` | Modified |
| `src/app/kiosk/KioskForm.tsx` | Modified |
| `src/lib/mobile-queue/status.ts` | New |
| `src/lib/mobile-queue/__tests__/status.test.ts` | New |
| `src/components/BarberMobileCard.tsx` | New |
| `src/components/BarberModal.tsx` | New |
| `src/app/tv-display/FirstAvailableCard.tsx` | New |
| `src/app/tv-display/MobileQueue.tsx` | New |
| `src/app/tv-display/TVDisplayTabs.tsx` | Modified |
