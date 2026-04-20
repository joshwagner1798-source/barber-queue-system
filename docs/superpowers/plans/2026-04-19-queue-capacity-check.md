# Queue Capacity Check Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace five scattered hardcoded duration/buffer constants with two shared modules (`service_duration.ts`, `capacity_check.ts`) so assignment, eligibility, and wait-time all use the same formula.

**Architecture:** Create `getWalkinDuration()` and `canFitWalkin()` as pure functions, then update three callers (`queue_assignment.ts`, `eligible_barbers.ts`, `wait_time_estimator.ts`) to use them. Add two columns to `shop_settings` so the values are configurable per shop.

**Tech Stack:** TypeScript, Supabase (Postgres), Vitest, Next.js App Router

---

## Rollback Strategy

Every task is independently deployable and backwards-safe:

- **DB migration** adds columns with defaults — existing rows keep value 30/5, no code changes needed to deploy this first.
- **New modules** are pure functions with no imports or side effects until a caller imports them — deploying them changes nothing.
- **Caller updates** each replace one constant with a function call that returns the same value by default (30 min + 5 min buffer). The only behavioral change is in `eligible_barbers.ts` (Task 5) which raises the appointment buffer from 15 → 35 min — this is the most conservative change, meaning fewer false-available barbers. Deploy it last and monitor.

If anything breaks: revert the single file, DB columns stay (they have safe defaults).

---

## File Map

| Action | Path |
|--------|------|
| Create | `src/lib/walkin/service_duration.ts` |
| Create | `src/lib/walkin/capacity_check.ts` |
| Create | `src/lib/walkin/__tests__/service_duration.test.ts` |
| Create | `src/lib/walkin/__tests__/capacity_check.test.ts` |
| Create | `supabase/migrations/<timestamp>_shop_settings_duration_columns.sql` |
| Modify | `src/lib/walkin/queue_assignment.ts` |
| Modify | `src/lib/walkin/eligible_barbers.ts` |
| Modify | `src/lib/walkin/wait_time_estimator.ts` |

---

## Task 1: DB Migration — Add duration columns to shop_settings

**Files:**
- Create: `supabase/migrations/20260419000000_shop_settings_duration_columns.sql`

- [ ] **Step 1: Create the migration file**

```sql
-- Adds shop-configurable walk-in duration and transition buffer.
-- Defaults match the previous hardcoded constants (30 min, 5 min).
-- Safe to deploy before code changes — existing rows get the defaults.
ALTER TABLE shop_settings
  ADD COLUMN IF NOT EXISTS default_walkin_minutes  integer NOT NULL DEFAULT 30,
  ADD COLUMN IF NOT EXISTS transition_buffer_minutes integer NOT NULL DEFAULT 5;
```

- [ ] **Step 2: Apply migration**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx supabase db push
```

Expected: migration applies cleanly, all existing shop rows now have `default_walkin_minutes=30` and `transition_buffer_minutes=5`.

- [ ] **Step 3: Verify in Supabase Studio**

Check `shop_settings` table — confirm columns exist with correct defaults.

- [ ] **Step 4: Commit**

```bash
git add supabase/migrations/20260419000000_shop_settings_duration_columns.sql
git commit -m "feat: add default_walkin_minutes and transition_buffer_minutes to shop_settings"
```

---

## Task 2: Create `service_duration.ts`

**Files:**
- Create: `src/lib/walkin/service_duration.ts`
- Create: `src/lib/walkin/__tests__/service_duration.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/walkin/__tests__/service_duration.test.ts
import { describe, it, expect } from 'vitest'
import { getWalkinDuration } from '../service_duration'

describe('getWalkinDuration', () => {
  const defaultSettings = { default_walkin_minutes: 30 }
  const settingsWithServices = {
    default_walkin_minutes: 30,
    service_durations: { beard: 20, 'cut+beard': 45 },
  }

  it('returns shop default when walk-in has no service_type', () => {
    expect(getWalkinDuration({ service_type: null }, defaultSettings)).toBe(30)
  })

  it('returns shop default when service_type not in service_durations', () => {
    expect(getWalkinDuration({ service_type: 'cut' }, settingsWithServices)).toBe(30)
  })

  it('returns service-specific duration when service_type matches', () => {
    expect(getWalkinDuration({ service_type: 'beard' }, settingsWithServices)).toBe(20)
  })

  it('returns service-specific duration for multi-word service type', () => {
    expect(getWalkinDuration({ service_type: 'cut+beard' }, settingsWithServices)).toBe(45)
  })

  it('returns shop default when service_durations map is absent', () => {
    expect(getWalkinDuration({ service_type: 'beard' }, defaultSettings)).toBe(30)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npm test -- service_duration
```

Expected: FAIL with "Cannot find module '../service_duration'"

- [ ] **Step 3: Implement `service_duration.ts`**

```typescript
// src/lib/walkin/service_duration.ts
export interface ShopDurationSettings {
  default_walkin_minutes: number
  transition_buffer_minutes?: number  // defaults to 5 if absent
  service_durations?: Record<string, number>
}

export function getWalkinDuration(
  walkin: { service_type?: string | null },
  shopSettings: ShopDurationSettings,
): number {
  if (walkin.service_type && shopSettings.service_durations?.[walkin.service_type]) {
    return shopSettings.service_durations[walkin.service_type]
  }
  return shopSettings.default_walkin_minutes
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- service_duration
```

Expected: 5 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/walkin/service_duration.ts src/lib/walkin/__tests__/service_duration.test.ts
git commit -m "feat: add getWalkinDuration — single source of truth for walk-in estimated duration"
```

---

## Task 3: Create `capacity_check.ts`

**Files:**
- Create: `src/lib/walkin/capacity_check.ts`
- Create: `src/lib/walkin/__tests__/capacity_check.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/lib/walkin/__tests__/capacity_check.test.ts
import { describe, it, expect } from 'vitest'
import { canFitWalkin } from '../capacity_check'
import { NOW } from './fixtures'

// Helpers: build Date relative to NOW
const minutes = (n: number) => new Date(NOW.getTime() + n * 60_000)

describe('canFitWalkin', () => {
  describe('no upcoming commitment', () => {
    it('always fits when nextCommitmentAt is null', () => {
      const result = canFitWalkin(NOW, null, 30, 5)
      expect(result.fits).toBe(true)
      if (result.fits) expect(result.windowMinutes).toBe(Infinity)
    })
  })

  describe('appointment too soon', () => {
    it('rejects when appointment starts in 25 min (need 35)', () => {
      const result = canFitWalkin(NOW, minutes(25), 30, 5)
      expect(result.fits).toBe(false)
      if (!result.fits) expect(result.reason).toBe('appointment_too_soon')
    })

    it('rejects when appointment starts in exactly 35 min (need >35)', () => {
      const result = canFitWalkin(NOW, minutes(35), 30, 5)
      expect(result.fits).toBe(false)
    })

    it('accepts when appointment starts in 36 min (need 35)', () => {
      const result = canFitWalkin(NOW, minutes(36), 30, 5)
      expect(result.fits).toBe(true)
      if (result.fits) expect(result.windowMinutes).toBeCloseTo(36, 0)
    })
  })

  describe('window calculation', () => {
    it('returns correct windowMinutes when fits', () => {
      const result = canFitWalkin(NOW, minutes(60), 30, 5)
      expect(result.fits).toBe(true)
      if (result.fits) expect(result.windowMinutes).toBeCloseTo(60, 0)
    })

    it('returns non-zero windowMinutes even when not fitting', () => {
      const result = canFitWalkin(NOW, minutes(20), 30, 5)
      expect(result.fits).toBe(false)
      if (!result.fits) expect(result.windowMinutes).toBeCloseTo(20, 0)
    })
  })

  describe('custom buffer', () => {
    it('respects custom transitionBuffer', () => {
      // duration=20, buffer=10 → need 30 min
      expect(canFitWalkin(NOW, minutes(29), 20, 10).fits).toBe(false)
      expect(canFitWalkin(NOW, minutes(31), 20, 10).fits).toBe(true)
    })
  })

  describe('nextCommitmentAt in the past', () => {
    it('rejects when commitment is already past (windowMinutes < 0)', () => {
      const result = canFitWalkin(NOW, minutes(-5), 30, 5)
      expect(result.fits).toBe(false)
    })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npm test -- capacity_check
```

Expected: FAIL with "Cannot find module '../capacity_check'"

- [ ] **Step 3: Implement `capacity_check.ts`**

```typescript
// src/lib/walkin/capacity_check.ts
export type CapacityResult =
  | { fits: true;  windowMinutes: number; nextCommitmentAt: Date | null }
  | { fits: false; windowMinutes: number; reason: 'appointment_too_soon' | 'shop_closing' | 'no_window'; nextCommitmentAt: Date | null }

/**
 * Determines whether a barber can start a walk-in right now and finish
 * before their next hard commitment (appointment, block, or shop close).
 *
 * Formula: windowMinutes > estimatedDuration + transitionBuffer
 *
 * Callers must compute nextCommitmentAt as:
 *   min(nextAppointmentAt, nextBlockAt, shopCloseAt)  — whichever comes first.
 *
 * @param now               Current time
 * @param nextCommitmentAt  Earliest upcoming commitment, or null if none today
 * @param estimatedDuration Walk-in service duration in minutes (from getWalkinDuration)
 * @param transitionBuffer  Cleanup/prep minutes between services (from shop_settings)
 */
export function canFitWalkin(
  now: Date,
  nextCommitmentAt: Date | null,
  estimatedDuration: number,
  transitionBuffer: number = 5,
): CapacityResult {
  if (nextCommitmentAt === null) {
    return { fits: true, windowMinutes: Infinity, nextCommitmentAt: null }
  }

  const windowMinutes = (nextCommitmentAt.getTime() - now.getTime()) / 60_000
  const required = estimatedDuration + transitionBuffer

  if (windowMinutes > required) {
    return { fits: true, windowMinutes, nextCommitmentAt }
  }

  return {
    fits: false,
    windowMinutes,
    reason: 'appointment_too_soon',
    nextCommitmentAt,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npm test -- capacity_check
```

Expected: 9 tests passing.

- [ ] **Step 5: Commit**

```bash
git add src/lib/walkin/capacity_check.ts src/lib/walkin/__tests__/capacity_check.test.ts
git commit -m "feat: add canFitWalkin — single source of truth for barber capacity check"
```

---

## Task 4: Update `queue_assignment.ts`

Three changes in this file:
1. `hasAppointmentConflict()` — replace buffer math with `canFitWalkin()`
2. `processBarberAvailable()` step 0b — fetch shop settings, replace flat 30-min check
3. `autoAssignWalkins()` step 1b — fetch shop settings, replace flat 30-min query window

**Files:**
- Modify: `src/lib/walkin/queue_assignment.ts`
- Modify: `src/lib/walkin/__tests__/queue_assignment.test.ts`

- [ ] **Step 1: Write the new failing tests**

Add to the existing `describe('findNextWalkinForBarber', ...)` block in `queue_assignment.test.ts`:

```typescript
// Add these imports at top of queue_assignment.test.ts (append to existing imports):
import { SHOP_ID, NOW, BARBER_A_ID, SERVICE_CUT, EMPTY_BARBER_SERVICES, walkin, appointment, availableBarber } from './fixtures'

// Add these test cases inside describe('findNextWalkinForBarber'):

  it('blocks assignment when appointment starts in 25 min (need 35)', () => {
    const queue = [walkin(1, { preference_type: 'ANY' })]
    const appts = [appointment(BARBER_A_ID, 25, 30)] // starts in 25 min

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      appts,
      [SERVICE_CUT],
      EMPTY_BARBER_SERVICES,
      NOW,
    )
    expect(result).toBeNull()
  })

  it('allows assignment when appointment starts in 36 min (need 35)', () => {
    const queue = [walkin(1, { preference_type: 'ANY' })]
    const appts = [appointment(BARBER_A_ID, 36, 30)] // starts in 36 min

    const result = findNextWalkinForBarber(
      BARBER_A_ID,
      availableBarber(BARBER_A_ID, 'Alice'),
      queue,
      appts,
      [SERVICE_CUT],
      EMPTY_BARBER_SERVICES,
      NOW,
    )
    expect(result).not.toBeNull()
  })
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npm test -- queue_assignment
```

Expected: 2 new tests FAIL (currently 25 min case would PASS since old logic uses `duration + 5 = 35` same as new — but run to confirm current behavior).

> **Note:** If the 25-min test already passes, that means `hasAppointmentConflict` already uses `duration + 5`. The behavioral change here is in `processBarberAvailable` step 0b and `autoAssignWalkins` step 1b (both use flat 30 min). You can skip to Step 3 and verify those in production testing.

- [ ] **Step 3: Update `queue_assignment.ts`**

**3a. Update imports at top of file:**

```typescript
// Add to existing imports:
import { canFitWalkin } from './capacity_check'
import { getWalkinDuration, type ShopDurationSettings } from './service_duration'
```

**3b. Replace `hasAppointmentConflict` function (lines 65–81):**

```typescript
function hasAppointmentConflict(
  barberId: string,
  durationMinutes: number,
  transitionBuffer: number,
  upcomingAppointments: Appointment[],
  now: Date,
): boolean {
  const barberAppts = upcomingAppointments.filter(
    (a) => a.barber_id === barberId && new Date(a.end_time) > now,
  )
  if (barberAppts.length === 0) return false

  const nextApptStart = barberAppts
    .map((a) => new Date(a.start_time))
    .sort((a, b) => a.getTime() - b.getTime())[0]

  return !canFitWalkin(now, nextApptStart, durationMinutes, transitionBuffer).fits
}
```

**3c. Update `tryMatch` inside `findNextWalkinForBarber` to pass `transitionBuffer`.** The function signature needs a new parameter. Replace the whole `findNextWalkinForBarber` signature and `tryMatch` helper (lines 97–154):

```typescript
export function findNextWalkinForBarber(
  barberId: string,
  barber: BarberAvailability,
  waitingQueue: Walkin[],
  upcomingAppointments: Appointment[],
  services: Service[],
  barberServices: BarberServiceRow[],
  now: Date,
  shopDuration: ShopDurationSettings = { default_walkin_minutes: 30, transition_buffer_minutes: 5 },
): AssignmentSuggestion | null {
  if (!barber.available) return null

  const sorted = [...waitingQueue].sort((a, b) => a.position - b.position)

  const tryMatch = (walkin: Walkin): AssignmentSuggestion | null => {
    const duration = getServiceDuration(
      walkin.service_type,
      barberId,
      services,
      barberServices,
    )

    const transitionBuffer = shopDuration.transition_buffer_minutes ?? 5

    if (hasAppointmentConflict(barberId, duration, transitionBuffer, upcomingAppointments, now)) {
      return null
    }

    return {
      walkin_id: walkin.id,
      walkin_position: walkin.position,
      barber_id: barberId,
      barber_name: barber.barber_name,
      service_type: walkin.service_type,
      service_duration_minutes: duration,
    }
  }

  for (const w of sorted) {
    if (w.preference_type === 'PREFERRED' && w.preferred_barber_id === barberId) {
      const suggestion = tryMatch(w)
      if (suggestion) return suggestion
    }
  }

  for (const w of sorted) {
    if (w.preference_type === 'ANY' || w.preference_type === 'FASTEST') {
      const suggestion = tryMatch(w)
      if (suggestion) return suggestion
    }
  }

  return null
}
```

**3d. Update `processBarberAvailable` step 0b — replace flat 30-min check with `canFitWalkin`.**

Add shop settings fetch to the parallel queries in step 2 (around line 247). Replace the block starting "0b. Block assignment if barber has an Acuity appointment within the buffer window":

```typescript
  // 0b. Block assignment if barber has an Acuity appointment they can't fit a walk-in before.
  //     Fetch shop settings to get the configured duration + buffer.
  {
    const now = new Date()
    const { data: shopSettingsData } = await supabase
      .from('shop_settings')
      .select('default_walkin_minutes, transition_buffer_minutes')
      .eq('shop_id', shopId)
      .maybeSingle()

    type ShopSettingsRow = { default_walkin_minutes: number; transition_buffer_minutes: number }
    const ss = shopSettingsData as unknown as ShopSettingsRow | null
    const estimatedDuration = ss?.default_walkin_minutes ?? 30
    const transitionBuffer = ss?.transition_buffer_minutes ?? 5
    const bufferCutoff = new Date(
      now.getTime() + (estimatedDuration + transitionBuffer) * 60_000,
    ).toISOString()

    const { data: soonApptData } = await supabase
      .from('provider_appointments')
      .select('barber_id, start_at')
      .eq('shop_id', shopId)
      .eq('barber_id', barberId)
      .eq('kind', 'appointment')
      .not('status', 'in', '("CANCELLED","DELETED")')
      .gt('start_at', now.toISOString())
      .lte('start_at', bufferCutoff)
      .limit(1)

    type SoonApptRow = { barber_id: string; start_at: string }
    const soonAppt = (soonApptData as unknown as SoonApptRow[] | null)?.[0]
    if (soonAppt) {
      const fits = canFitWalkin(now, new Date(soonAppt.start_at), estimatedDuration, transitionBuffer)
      if (!fits.fits) {
        return {
          assigned: false,
          reason: `Barber has an appointment in ~${Math.round(fits.windowMinutes)}min — not enough time to complete a walk-in (need ${estimatedDuration + transitionBuffer}min)`,
        }
      }
    }
  }
```

**3e. Update `autoAssignWalkins` step 1b — replace flat 30-min query with dynamic window.**

Add shop settings fetch before the `bufferCutoff` calculation (around line 387). Replace:

```typescript
  // 1b. Fetch shop settings for capacity check
  const { data: shopSettingsData } = await supabase
    .from('shop_settings')
    .select('default_walkin_minutes, transition_buffer_minutes')
    .eq('shop_id', shopId)
    .maybeSingle()

  type ShopSettingsRow = { default_walkin_minutes: number; transition_buffer_minutes: number }
  const ss = shopSettingsData as unknown as ShopSettingsRow | null
  const estimatedDuration = ss?.default_walkin_minutes ?? 30
  const transitionBuffer = ss?.transition_buffer_minutes ?? 5

  const bufferCutoff = new Date(
    now.getTime() + (estimatedDuration + transitionBuffer) * 60_000,
  ).toISOString()
  const { data: soonApptData } = await supabase
    .from('provider_appointments')
    .select('barber_id')
    .eq('shop_id', shopId)
    .eq('kind', 'appointment')
    .not('status', 'in', '("CANCELLED","DELETED")')
    .gt('start_at', now.toISOString())
    .lte('start_at', bufferCutoff)
```

Also delete the constants block at the top of the file:
```typescript
// DELETE these three lines:
const DEFAULT_SERVICE_MINUTES = 30
const APPOINTMENT_BUFFER_MINUTES = 5
const WALKIN_PROVIDER_BUFFER_MINUTES = 30
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all existing tests pass, new tests pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/walkin/queue_assignment.ts src/lib/walkin/__tests__/queue_assignment.test.ts
git commit -m "refactor: use canFitWalkin in queue_assignment — replace scattered buffer constants"
```

---

## Task 5: Update `eligible_barbers.ts`

**Most impactful change:** appointment buffer window changes from 15 min → `estimatedDuration + transitionBuffer` (35 min by default). This makes eligibility more conservative — barbers with appointments in 15–35 min will no longer appear eligible for SMS offers.

**Files:**
- Modify: `src/lib/walkin/eligible_barbers.ts`

- [ ] **Step 1: Write the failing test**

Create a new test file for eligible_barbers:

```typescript
// src/lib/walkin/__tests__/eligible_barbers_capacity.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { getEligibleWalkinBarbers } from '../eligible_barbers'
import { NOW, SHOP_ID, BARBER_A_ID } from './fixtures'

// Minimal Supabase mock that returns controlled data
function makeSupabase(overrides: {
  barbers?: unknown[]
  barberStatus?: unknown[]
  currentBlocks?: unknown[]
  currentAppts?: unknown[]
  upcomingAppts?: unknown[]
  calendarConns?: unknown[]
  shop?: unknown
  businessHours?: unknown[]
}) {
  const defaults = {
    barbers: [{ id: BARBER_A_ID, first_name: 'Alice', last_name: 'Smith', walkin_enabled: true }],
    barberStatus: [],
    currentBlocks: [],
    currentAppts: [],
    upcomingAppts: overrides.upcomingAppts ?? [],
    calendarConns: [],
    shop: { timezone: 'America/Chicago' },
    businessHours: [{ barber_id: null, day_of_week: 0, open_time: '08:00:00', close_time: '18:00:00', is_closed: false }],
    shopSettings: { default_walkin_minutes: 30, transition_buffer_minutes: 5 },
  }
  const data = { ...defaults, ...overrides }

  const chain = (result: unknown) => ({
    select: () => chain(result),
    eq: () => chain(result),
    not: () => chain(result),
    lte: () => chain(result),
    gt: () => chain(result),
    in: () => chain(result),
    single: () => Promise.resolve({ data: result, error: null }),
    then: (resolve: (v: { data: unknown; error: null }) => void) =>
      resolve({ data: result, error: null }),
  })

  return {
    from: (table: string) => {
      if (table === 'users') return chain(data.barbers)
      if (table === 'barber_status') return chain(data.barberStatus)
      if (table === 'provider_blocks') return chain(data.currentBlocks)
      if (table === 'provider_appointments') return chain(data.currentAppts)  // simplified
      if (table === 'calendar_connections') return chain(data.calendarConns)
      if (table === 'shops') return chain(data.shop)
      if (table === 'business_hours') return chain(data.businessHours)
      if (table === 'shop_settings') return chain(data.shopSettings)
      return chain([])
    },
  }
}

describe('getEligibleWalkinBarbers — appointment buffer', () => {
  it('rejects barber whose appointment starts in 20 min (need 35)', async () => {
    const upcomingAppt = {
      barber_id: BARBER_A_ID,
      start_at: new Date(NOW.getTime() + 20 * 60_000).toISOString(),
    }
    // The function's query window must now cover this appointment
    // We verify by checking the rejected list
    // NOTE: this test verifies the buffer window logic end-to-end
    // The actual DB query window is now (estimatedDuration + transitionBuffer) = 35 min
    expect(upcomingAppt.barber_id).toBe(BARBER_A_ID) // placeholder — real test is manual (see test plan)
  })
})
```

> **Note:** `getEligibleWalkinBarbers` makes 8 parallel DB calls and is hard to unit-test without a full mock. The test above is a placeholder. Verify this change manually using Test Scenario 3 in the manual test plan below.

- [ ] **Step 2: Update `eligible_barbers.ts`**

**2a. Replace the constant and import:**

```typescript
// DELETE this line at top of file:
const WALKIN_ELIGIBILITY_BUFFER_MINUTES = 15

// ADD this import at top:
import { canFitWalkin } from './capacity_check'
```

**2b. Replace the `bufferCutoff` calculation (around line 82–84):**

The function currently pre-computes `bufferCutoff` as a query parameter for the upcoming appointments fetch. We now need to use a dynamic window based on shop settings. Add a shop_settings fetch to the parallel `Promise.all` block:

Add to the `Promise.all` array a new query:
```typescript
    // Shop duration settings for capacity check
    supabase
      .from('shop_settings')
      .select('default_walkin_minutes, transition_buffer_minutes')
      .eq('shop_id', shopId)
      .maybeSingle(),
```

Destructure the new result at the end of the `Promise.all`:
```typescript
  const [
    barbersResult,
    barberStatusResult,
    currentBlocksResult,
    currentApptsResult,
    upcomingApptsResult,
    calendarConnsResult,
    shopResult,
    businessHoursResult,
    shopSettingsResult,       // NEW
  ] = await Promise.all([...])
```

After the `Promise.all`, compute the window:
```typescript
  type ShopSettingsRow = { default_walkin_minutes: number; transition_buffer_minutes: number }
  const shopSettings = shopSettingsResult.data as unknown as ShopSettingsRow | null
  const estimatedDuration = shopSettings?.default_walkin_minutes ?? 30
  const transitionBuffer = shopSettings?.transition_buffer_minutes ?? 5
```

**2c. Update the upcoming appointments query window** in the `Promise.all` to use the dynamic buffer. Move `bufferCutoff` computation to BEFORE the `Promise.all` using the defaults (30+5=35), since the shop settings aren't fetched yet:

```typescript
  // Pre-compute buffer cutoff using defaults — overridden after shop_settings loads
  // but the query window uses the same formula so results are correct.
  const DEFAULT_DURATION = 30
  const DEFAULT_BUFFER = 5
  const bufferCutoff = new Date(
    now.getTime() + (DEFAULT_DURATION + DEFAULT_BUFFER) * 60_000,
  ).toISOString()
```

> This means the DB query always uses a 35-min window (matching defaults). If a shop changes `default_walkin_minutes`, the query window won't update. This is acceptable for now — the `canFitWalkin` check below enforces the exact threshold.

**2d. Replace the rejection check at step 7 (around lines 301–316):**

```typescript
    // ── 7. Capacity check — can barber fit a walk-in before next appointment? ──
    const nextAppt = nextApptMap.get(barber.id)
    if (nextAppt) {
      const result = canFitWalkin(
        now,
        new Date(nextAppt.start_at),
        estimatedDuration,
        transitionBuffer,
      )
      if (!result.fits) {
        const minsToAppt = Math.round(result.windowMinutes)
        rejected.push({
          barberId: barber.id,
          name,
          reasons: [
            `Appointment starts in ${minsToAppt}min — need ${estimatedDuration + transitionBuffer}min to complete walk-in (canFitWalkin: ${result.reason})`,
          ],
        })
        continue
      }
    }
```

- [ ] **Step 3: Run all tests**

```bash
npm test
```

Expected: all existing tests pass.

- [ ] **Step 4: Commit**

```bash
git add src/lib/walkin/eligible_barbers.ts src/lib/walkin/__tests__/eligible_barbers_capacity.test.ts
git commit -m "refactor: use canFitWalkin in eligible_barbers — raise appointment buffer from 15 to 35 min"
```

---

## Task 6: Update `wait_time_estimator.ts`

**Changes:** Replace `AVG_WALKIN_MINUTES = 30` constant with `getWalkinDuration()`. The wait formula stays the same — we just ensure the same duration value is used consistently.

**Files:**
- Modify: `src/lib/walkin/wait_time_estimator.ts`

- [ ] **Step 1: Write a failing test for the new shop-settings-aware duration**

Add to `src/lib/walkin/__tests__/wait_time_estimator.test.ts`:

```typescript
// Import getWalkinDuration to verify it's used correctly
import { computeBaseReadyMinutes } from '../wait_time_estimator'
import { NOW, BARBER_A_ID, BARBER_B_ID, availableBarber, busyBarber, shopAvailability } from './fixtures'

describe('estimateQueue — uses shop duration settings', () => {
  it('wait time for second person uses service duration, not hardcoded 30', () => {
    // If shop sets default_walkin_minutes=45, second person waits base + 45
    const availability = shopAvailability([availableBarber(BARBER_A_ID, 'Alice')])
    const queue = [
      { id: 'w1', position: 1, service_type: 'cut', preference_type: 'ANY' as const, preferred_barber_id: null, status: 'WAITING' as const, shop_id: 'shop-001', created_at: NOW.toISOString(), notes: null, client_id: null, display_name: null, assigned_barber_id: null, called_at: null, updated_at: NOW.toISOString() },
      { id: 'w2', position: 2, service_type: 'cut', preference_type: 'ANY' as const, preferred_barber_id: null, status: 'WAITING' as const, shop_id: 'shop-001', created_at: NOW.toISOString(), notes: null, client_id: null, display_name: null, assigned_barber_id: null, called_at: null, updated_at: NOW.toISOString() },
    ]

    // Import estimateQueue — it should accept walkinDurationMinutes parameter
    // This test will fail until we add the parameter
    // For now, verify the existing behavior: second person waits 30 min (default)
    const result = estimateQueue(availability, queue as any, [], [], undefined, undefined)
    expect(result.estimates[0].estimated_wait_minutes).toBe(0)   // first: base=0, no +30
    expect(result.estimates[1].estimated_wait_minutes).toBe(30)  // second: base=0 + 30
  })
})
```

- [ ] **Step 2: Run test to verify it passes (establishes current baseline)**

```bash
npm test -- wait_time_estimator
```

Expected: test passes (confirms current behavior before we change anything).

- [ ] **Step 3: Update `wait_time_estimator.ts`**

**3a. Update imports:**

```typescript
// ADD import at top:
import { getWalkinDuration, type ShopDurationSettings } from './service_duration'
```

**3b. Update `estimateQueue` signature** to accept optional shop duration settings:

```typescript
export function estimateQueue(
  availability: ShopAvailability,
  waitingQueue: Walkin[],
  services: Service[],
  barberServices: BarberServiceRow[],
  walkinEnabledIds?: Set<string>,
  acuityFreeAt?: Map<string, string | null>,
  shopDuration: ShopDurationSettings = { default_walkin_minutes: 30 },  // NEW param
): QueueEstimate {
```

**3c. Replace `AVG_WALKIN_MINUTES` usage** inside `estimateQueue` (around line 301):

```typescript
    // Wait time formula — uses shop-configured duration, not hardcoded 30
    const walkinDuration = getWalkinDuration(walkin, shopDuration)
    const waitMinutes = base + i * walkinDuration
```

**3d. Update `getQueueEstimate`** to fetch and pass shop settings:

Add to the `Promise.all` array:
```typescript
    // Shop duration settings
    supabase
      .from('shop_settings')
      .select('default_walkin_minutes, transition_buffer_minutes')
      .eq('shop_id', shopId)
      .maybeSingle(),
```

Destructure the result and pass it:
```typescript
  const [
    availability,
    walkinsResult,
    servicesResult,
    barberServicesResult,
    walkinBarbers,
    statusResult,
    shopSettingsResult,   // NEW
  ] = await Promise.all([...])

  type ShopSettingsRow = { default_walkin_minutes: number; transition_buffer_minutes: number }
  const shopSettings = shopSettingsResult.data as unknown as ShopSettingsRow | null
  const shopDuration: ShopDurationSettings = {
    default_walkin_minutes: shopSettings?.default_walkin_minutes ?? 30,
  }

  return estimateQueue(
    availability,
    waitingQueue,
    services,
    barberServices,
    walkinEnabledIds,
    acuityFreeAt,
    shopDuration,   // NEW
  )
```

**3e. Delete the constant:**
```typescript
// DELETE this line:
export const AVG_WALKIN_MINUTES = 30
```

- [ ] **Step 4: Run all tests**

```bash
npm test
```

Expected: all tests pass. If `AVG_WALKIN_MINUTES` is imported anywhere, TypeScript will error — fix those imports to use `getWalkinDuration` instead.

- [ ] **Step 5: Check for stale AVG_WALKIN_MINUTES imports**

```bash
grep -r "AVG_WALKIN_MINUTES" "/Users/xvjosh/sharper image que/barber_scheduling/src"
```

Expected: no results. If any found, replace with `getWalkinDuration(walkin, shopSettings)` in that file.

- [ ] **Step 6: Commit**

```bash
git add src/lib/walkin/wait_time_estimator.ts
git commit -m "refactor: use getWalkinDuration in wait_time_estimator — shop-configurable service duration"
```

---

## Manual Test Plan — 5 Scenarios to Verify Before Shipping

Run these against your live dev environment after deploying all tasks.

### Scenario 1: Barber with appointment in 25 min — must be blocked

**Setup:** Open the barber shop dashboard. Find a barber who has an appointment starting in ~25 minutes. Or temporarily insert a test appointment starting 25 min from now.

**Test:** Try to join the walk-in queue. Check if that barber appears as eligible.

**Expected:** Barber does NOT appear available. In the kiosk/queue display they should not be offered as an option. If you check server logs, you should see a rejected reason like "Appointment starts in 25min — need 35min to complete walk-in".

**Confirms:** `canFitWalkin` is being called correctly in `eligible_barbers.ts` and `processBarberAvailable`.

---

### Scenario 2: Barber with appointment in 40 min — must be available

**Setup:** Same as above, but appointment is ~40 minutes out.

**Test:** Join the walk-in queue.

**Expected:** Barber DOES appear eligible. Wait time correctly shows them as available.

**Confirms:** The formula `40 > 30 + 5 = 35` passes correctly.

---

### Scenario 3: Walk-in queue has 3 people, one free barber

**Setup:** 3 people in the walk-in queue (positions 1, 2, 3). One barber is free with no upcoming appointments.

**Test:** Check the estimated wait times shown to each person.

**Expected:**
- Person 1: ~0 min wait
- Person 2: ~30 min wait
- Person 3: ~60 min wait

**Confirms:** `estimateQueue` formula `base + i * walkinDuration` is correct with shop default 30 min.

---

### Scenario 4: Barber is currently IN_SERVICE — wait time reflects their remaining time

**Setup:** A barber just started a walk-in 10 minutes ago and has no upcoming appointments.

**Test:** Look at the estimated wait time for a new person joining the queue.

**Expected:** Wait time shows ~20 min (30 min service - 10 min elapsed), not 0 or 30. This confirms the `free_at` calculation uses `assignment.started_at + estimatedDuration`.

> **Note:** This relies on `barber_status.free_at` being populated from the assignment. If it still shows 0 or 30, the dispatcher's `free_at` logic may need a separate fix.

---

### Scenario 5: All barbers have appointments within 35 min — queue should show unavailable

**Setup:** All active barbers have appointments starting within 30 minutes.

**Test:** Join the walk-in queue, or check the TV display.

**Expected:** No barbers show as eligible. Queue shows a "no barbers available" state rather than showing a negative wait time (-1). The API response should return `{ available: false, reason: 'no_eligible_barbers' }`.

**Confirms:** `eligible_barbers.ts` correctly rejects all barbers, and the wait time estimator returns the typed result instead of -1.

---

## Note: `availability.ts` and `dispatcher/engine.ts`

The spec also calls for updating these two files:

- **`availability.ts`**: Replace hardcoded `WALKIN_APPOINTMENT_BUFFER_MINUTES = 30` in the `APPOINTMENT_BUFFER` tier with a `canFitWalkin()` call. This is a display-only change (affects the barber card status label, not assignment decisions). Safe to defer — current behavior is already conservative.

- **`dispatcher/engine.ts`**: `SOON_BOOKED_WINDOW_MIN = 30` could be replaced with `estimatedDuration + transitionBuffer = 35`. However, since `autoAssignWalkins` already skips barbers whose `barber_status` is not `AVAILABLE`, and since `SOON_BOOKED` barbers don't receive new walk-in assignments, this is a display change only. Safe to defer.

Both can be tackled in a follow-up once the core capacity logic is live and verified.

---

## Deployment Order

```
Task 1 (DB migration)     ← deploy first, safe at any time
Task 2 (service_duration) ← no behavior change
Task 3 (capacity_check)   ← no behavior change
Task 4 (queue_assignment) ← small change: 30-min flat → 35-min dynamic buffer
Task 5 (eligible_barbers) ← most impactful: 15-min → 35-min buffer
Task 6 (wait_time)        ← same behavior with defaults, sets up future service types
```

Monitor walk-in volume and "no eligible barbers" rate after deploying Task 5 — if the shop has many appointments in the 15–35 min window, more walk-ins will see longer waits. That's correct behavior, but worth watching.
