# Owner Setup Flow — Design Spec

**Date:** 2026-03-27
**Status:** Approved for implementation
**Scope:** Phase 1 — services + business hours, inside existing /admin page

---

## Goal

Give an owner the simplest possible way to configure the essentials for a real shop launch — services and business hours — without manual DB edits. This is a launch-enabling tool, not a feature showcase.

---

## What This Is Not

- Not a new route or separate setup page
- Not a redesign of /admin
- Not analytics, reporting, or a full dashboard
- Not barber-level hours (shop-level only for Phase 1)

---

## Architecture

```
src/app/admin/
  AdminDashboard.tsx            ← append <ServicesPanel> + <BusinessHoursPanel>
  ServicesPanel.tsx             ← new client component
  BusinessHoursPanel.tsx        ← new client component

src/app/api/owner/
  services/
    route.ts                    ← GET (list) + POST (create)
    [id]/route.ts               ← PATCH (edit name/duration/price/is_active)
  hours/
    route.ts                    ← GET (load) + PUT (save all 7 days)
```

Both components receive `{ shopId: string }` as their only prop — identical to every existing admin panel. Auth is enforced upstream by `src/app/admin/page.tsx` (role must be `admin` or `owner`) before `AdminDashboard` renders. API routes use `requireShopId` + `createAdminClient`, matching the pattern in `src/app/api/owner/barbers/route.ts`.

`AdminDashboard.tsx` change: two component imports + two JSX lines appended at the bottom of the return. No other changes to that file.

---

## ServicesPanel

**File:** `src/app/admin/ServicesPanel.tsx`
**Props:** `{ shopId: string }`

### Data loading

Fetches `GET /api/owner/services?shop_id={shopId}` on mount. Renders all services including inactive ones (inactive rows render at reduced opacity).

### Service row

Each row displays:

| Field | Interaction |
|---|---|
| Name | Click to edit inline — text input, blur or Enter saves |
| Duration | Click to edit inline — number input (minutes), blur or Enter saves |
| Price | Click to edit inline — number input (dollars), blur or Enter saves |
| Active toggle | Immediate save on toggle — uses shared `Toggle` component (see Toggle note below) |

**Toggle component note:** `Toggle` is currently defined inline inside `BarberManagementPanel.tsx` and not exported. Implementation must extract it to `src/app/admin/Toggle.tsx` as a shared component, update `BarberManagementPanel` to import from there, and import it in both new panels. This is a prerequisite for both `ServicesPanel` and `BusinessHoursPanel`.

Inline editing follows the exact pattern from `BarberManagementPanel`: click shows an input in place of the display value, blur/Enter fires `PATCH /api/owner/services/[id]`, on success the row updates, on failure an inline error appears below the row and the input re-focuses.

Saving state per row: buttons/toggles disable while in-flight. Error clears on next save attempt.

### Add service

A small "Add service" button sits in the section header (right side). Clicking it appends an inline form row at the bottom of the list:

- Name input (required)
- Duration input in minutes (required, must be > 0)
- Price input in dollars (required, must be ≥ 0)
- "Save" + "Cancel" buttons

Client validates before POST: name non-empty, duration > 0, price ≥ 0. Validation error shown inline, no request fired.

On successful POST: new service appended to list, form hidden.
On POST failure: inline error below form inputs, form stays open.
Cancel: hides form, no request.

### State shape

```ts
services: Service[]
adding: boolean
addForm: { name: string; duration: string; price: string }
addSaving: boolean
addError: string
editing: Record<string, { name: string; duration: string; price: string } | null>
saving: Record<string, boolean>
errors: Record<string, string>
```

---

## BusinessHoursPanel

**File:** `src/app/admin/BusinessHoursPanel.tsx`
**Props:** `{ shopId: string }`

### Data loading

Fetches `GET /api/owner/hours?shop_id={shopId}` on mount. Returns 0–7 rows from the DB. Days not present in the DB response default to:

```
open_time: '09:00'
close_time: '18:00'
is_closed: false
```

Defaults are local state only — nothing is written to the DB until "Save hours" is clicked.

### Per-day row

Seven rows in order: Sunday, Monday, Tuesday, Wednesday, Thursday, Friday, Saturday (day_of_week 0–6).

Each row:

| Element | Behavior |
|---|---|
| Day name | Fixed label |
| open_time input | Text input, `HH:MM` 24-hour format. Disabled when `is_closed` is true |
| close_time input | Text input, `HH:MM` 24-hour format. Disabled when `is_closed` is true |
| Closed toggle | Shared `Toggle` component. When enabled, time inputs grey out |

### Save

Single "Save hours" button at the bottom of the section. On click:

1. Client sends all 7 days together via `PUT /api/owner/hours`
2. Button disables while in-flight
3. On success: `Saved ✓` appears inline next to the section header for 2 seconds, then clears — same pattern as `UISettingsPanel`
4. On failure: inline error next to the header, button re-enables

### State shape

```ts
type DayHours = {
  day_of_week: number      // 0–6
  open_time: string        // 'HH:MM'
  close_time: string       // 'HH:MM'
  is_closed: boolean
}

hours: DayHours[]          // always 7 items after load
saving: boolean
saved: boolean
error: string
```

---

## API Routes

### GET /api/owner/services

**File:** `src/app/api/owner/services/route.ts`

Resolves `shop_id` via `requireShopId`. Reads `services` table filtered by `shop_id`, ordered by `display_order asc`.

Returns: `id, name, duration_minutes, price, is_active, display_order`

---

### POST /api/owner/services

**File:** `src/app/api/owner/services/route.ts`

**Request body:**
```ts
{ shop_id: string; name: string; duration_minutes: number; price: number }
```

**Server validation:**
- `name` — non-empty string
- `duration_minutes` — integer > 0
- `price` — number ≥ 0

Invalid: 400 with `{ error: string }`.

Sets `is_active: true`. Sets `display_order` to current count of services for that shop + 1.

Returns created row (201).

---

### PATCH /api/owner/services/[id]

**File:** `src/app/api/owner/services/[id]/route.ts`

Whitelisted fields: `name | duration_minutes | price | is_active`

No unlisted fields accepted (same whitelist pattern as `/api/owner/barbers/[id]`).

**Server validation (when field is present):**
- `name` — non-empty string
- `duration_minutes` — integer > 0
- `price` — number ≥ 0
- `is_active` — boolean

Invalid: 400. Returns updated row on success.

---

### GET /api/owner/hours

**File:** `src/app/api/owner/hours/route.ts`

Resolves `shop_id` via `requireShopId`. Reads `business_hours` where `shop_id = ? AND barber_id IS NULL`. Returns 0–7 rows — client fills defaults for missing days.

Returns: `day_of_week, open_time, close_time, is_closed`

---

### PUT /api/owner/hours

**File:** `src/app/api/owner/hours/route.ts`

**Request body:**
```ts
{
  shop_id: string
  hours: Array<{
    day_of_week: number    // 0–6
    open_time: string      // 'HH:MM'
    close_time: string     // 'HH:MM'
    is_closed: boolean
  }>
}
```

**Server validation (applied per row):**

1. `day_of_week` must be an integer 0–6
2. `open_time` and `close_time` must match `/^\d{2}:\d{2}$/`
3. **If `is_closed` is false:** `open_time` must be strictly earlier than `close_time`. Hours are compared as `HH:MM` strings (lexicographic comparison is valid for zero-padded 24h times). Invalid rows → 400 with a clear message identifying which day failed:
   ```json
   { "error": "Monday: open_time must be earlier than close_time" }
   ```

All rows are validated before any DB write. If any row fails, the entire request is rejected (400) and nothing is written.

On success: upserts all provided rows using `onConflict: 'shop_id, barber_id, day_of_week'`. Returns `{ ok: true }`.

---

## Unique Constraint Prerequisite

`PUT /api/owner/hours` uses Supabase upsert with `onConflict: 'shop_id, barber_id, day_of_week'`. This requires a unique constraint on those three columns in the `business_hours` table.

**Implementation must verify this constraint exists before wiring the upsert.**

If it does not exist, a migration must be added first:

```sql
ALTER TABLE business_hours
  ADD CONSTRAINT business_hours_shop_barber_day_unique
  UNIQUE (shop_id, barber_id, day_of_week);
```

This is a hard prerequisite. The PUT route will fail at runtime without it.

---

## AdminDashboard.tsx Change

Two additions only:

```tsx
import { ServicesPanel } from './ServicesPanel'
import { BusinessHoursPanel } from './BusinessHoursPanel'

// At the bottom of the return, after <UISettingsPanel>:
<ServicesPanel shopId={shopId} />
<BusinessHoursPanel shopId={shopId} />
```

No other changes to `AdminDashboard.tsx`.

---

## Error Handling Summary

| Scenario | Behavior |
|---|---|
| Service load fails | Silent — empty list renders, no crash |
| Service row save fails | Inline error below row, input re-enables |
| Add service POST fails | Inline error below add form, form stays open |
| Hours load fails | Silent — all 7 days render with defaults |
| Hours PUT validation failure | Server returns 400 + named day in error message; displayed inline next to Save button |
| Hours PUT network/server error | Inline error next to Save button, button re-enables |

---

## Files Summary

| Action | File |
|---|---|
| Create | `src/app/admin/Toggle.tsx` (extracted from BarberManagementPanel) |
| Create | `src/app/admin/ServicesPanel.tsx` |
| Create | `src/app/admin/BusinessHoursPanel.tsx` |
| Create | `src/app/api/owner/services/route.ts` |
| Create | `src/app/api/owner/services/[id]/route.ts` |
| Create | `src/app/api/owner/hours/route.ts` |
| Modify | `src/app/admin/BarberManagementPanel.tsx` (import Toggle from shared file) |
| Modify | `src/app/admin/AdminDashboard.tsx` (two imports + two JSX lines) |
| Prerequisite | Migration: unique constraint on `business_hours(shop_id, barber_id, day_of_week)` if not already present |

---

## Owner Capabilities Added

- View all services (name, duration, price, active status)
- Add a new service with name, duration, and price
- Edit any service field inline
- Toggle a service active or inactive
- View business hours for all 7 days
- Set open and close time per day
- Mark any day as closed
- Save all hours changes in one action

---

## Deferred (Not Phase 1)

- Per-barber hours overrides
- Service delete (toggle inactive is sufficient for launch)
- Service display_order drag-to-reorder
- Service categories
- Deposit amounts per service
- Description field on services
