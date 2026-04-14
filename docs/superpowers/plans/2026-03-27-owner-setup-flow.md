# Owner Setup Flow Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add ServicesPanel and BusinessHoursPanel to the existing /admin page so owners can configure services and business hours without manual DB edits.

**Architecture:** Two new client components appended to AdminDashboard.tsx following the exact pattern of BarberManagementPanel and UISettingsPanel. Five new API routes under /api/owner/. A shared Toggle component extracted from BarberManagementPanel. Hours validation logic extracted to a pure function and unit-tested.

**Tech Stack:** Next.js 16 App Router, TypeScript, Tailwind CSS, Supabase (admin client), Vitest

---

## File Map

| Action | File | Responsibility |
|--------|------|----------------|
| Create | `src/lib/owner/hours-validation.ts` | Pure `validateHoursRow` function |
| Create | `src/lib/owner/__tests__/hours-validation.test.ts` | Unit tests for hours validation |
| Create | `src/app/admin/Toggle.tsx` | Shared toggle component |
| Modify | `src/app/admin/BarberManagementPanel.tsx` | Import Toggle from `./Toggle` |
| Create | `src/app/api/owner/services/route.ts` | GET list + POST create |
| Create | `src/app/api/owner/services/[id]/route.ts` | PATCH edit fields + toggle active |
| Create | `src/app/api/owner/hours/route.ts` | GET load + PUT save all 7 days |
| Create | `src/app/admin/ServicesPanel.tsx` | Services list + inline editing |
| Create | `src/app/admin/BusinessHoursPanel.tsx` | Business hours per-day editing |
| Modify | `src/app/admin/AdminDashboard.tsx` | Append both panels |

---

## Constraint Note

The spec referenced upsert for `PUT /api/owner/hours` with `onConflict: 'shop_id,barber_id,day_of_week'`. The constraint `business_hours_unique` already exists (migration 00001). However, since shop-level rows have `barber_id = NULL` and PostgreSQL standard UNIQUE treats NULLs as distinct (not equal to each other), upsert would silently insert duplicate rows instead of updating.

**Resolution:** The PUT handler uses DELETE + INSERT instead of upsert. This is safe and correct for this admin-only endpoint. No new migration is required.

---

## Task 1: Hours validation logic

**Files:**
- Create: `src/lib/owner/hours-validation.ts`
- Create: `src/lib/owner/__tests__/hours-validation.test.ts`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/owner/__tests__/hours-validation.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { validateHoursRow } from '../hours-validation'

describe('validateHoursRow', () => {
  it('returns null for a valid open day', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toBeNull()
  })

  it('returns null for a closed day regardless of times', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '18:00', close_time: '09:00', is_closed: true })
    ).toBeNull()
  })

  it('rejects day_of_week above 6', () => {
    expect(
      validateHoursRow({ day_of_week: 7, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toMatch(/day_of_week/)
  })

  it('rejects negative day_of_week', () => {
    expect(
      validateHoursRow({ day_of_week: -1, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toMatch(/day_of_week/)
  })

  it('rejects non-integer day_of_week', () => {
    expect(
      validateHoursRow({ day_of_week: 1.5, open_time: '09:00', close_time: '18:00', is_closed: false })
    ).toMatch(/day_of_week/)
  })

  it('rejects open_time missing leading zero', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '9:00', close_time: '18:00', is_closed: false })
    ).toMatch(/open_time/)
  })

  it('rejects non-HH:MM open_time', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: 'foo', close_time: '18:00', is_closed: false })
    ).toMatch(/open_time/)
  })

  it('rejects close_time missing leading zero', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: '6:00', is_closed: false })
    ).toMatch(/close_time/)
  })

  it('rejects open_time equal to close_time when not closed', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '09:00', close_time: '09:00', is_closed: false })
    ).toMatch(/earlier/)
  })

  it('rejects open_time later than close_time when not closed', () => {
    expect(
      validateHoursRow({ day_of_week: 1, open_time: '18:00', close_time: '09:00', is_closed: false })
    ).toMatch(/earlier/)
  })

  it('includes the day name in the error message', () => {
    const err = validateHoursRow({ day_of_week: 1, open_time: '18:00', close_time: '09:00', is_closed: false })
    expect(err).toMatch(/Monday/)
  })
})
```

- [ ] **Step 2: Run tests — expect failure (module not found)**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npm test -- src/lib/owner/__tests__/hours-validation.test.ts
```

Expected: FAIL — `Cannot find module '../hours-validation'`

- [ ] **Step 3: Implement `validateHoursRow`**

Create `src/lib/owner/hours-validation.ts`:

```ts
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']
const TIME_RE = /^\d{2}:\d{2}$/

export interface HoursRow {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

/**
 * Validates a single business hours row.
 * Returns null if valid, or a human-readable error string if invalid.
 *
 * Rules:
 * - day_of_week must be integer 0–6
 * - open_time and close_time must be HH:MM (zero-padded 24h)
 * - if is_closed is false, open_time must be strictly earlier than close_time
 *   (lexicographic comparison is valid for zero-padded HH:MM strings)
 */
export function validateHoursRow(row: HoursRow): string | null {
  if (!Number.isInteger(row.day_of_week) || row.day_of_week < 0 || row.day_of_week > 6) {
    return 'day_of_week must be an integer 0–6'
  }
  const dayName = DAY_NAMES[row.day_of_week]
  if (!TIME_RE.test(row.open_time)) {
    return `${dayName}: open_time must be in HH:MM format`
  }
  if (!TIME_RE.test(row.close_time)) {
    return `${dayName}: close_time must be in HH:MM format`
  }
  if (!row.is_closed && row.open_time >= row.close_time) {
    return `${dayName}: open_time must be earlier than close_time`
  }
  return null
}
```

- [ ] **Step 4: Run tests — expect all pass**

```bash
npm test -- src/lib/owner/__tests__/hours-validation.test.ts
```

Expected: PASS — 11 tests

- [ ] **Step 5: Commit**

```bash
git add src/lib/owner/hours-validation.ts src/lib/owner/__tests__/hours-validation.test.ts
git commit -m "feat: add hours validation logic with unit tests"
```

---

## Task 2: Extract Toggle to shared component

**Files:**
- Create: `src/app/admin/Toggle.tsx`
- Modify: `src/app/admin/BarberManagementPanel.tsx`

- [ ] **Step 1: Create `src/app/admin/Toggle.tsx`**

```tsx
'use client'

interface ToggleProps {
  checked: boolean
  onChange: (v: boolean) => void
  disabled?: boolean
}

export function Toggle({ checked, onChange, disabled }: ToggleProps) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      disabled={disabled}
      onClick={() => onChange(!checked)}
      className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none disabled:opacity-50 ${
        checked ? 'bg-primary-500' : 'bg-secondary-600'
      }`}
    >
      <span
        className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-1'
        }`}
      />
    </button>
  )
}
```

- [ ] **Step 2: Update `BarberManagementPanel.tsx`**

At the top of `src/app/admin/BarberManagementPanel.tsx`, add the import after the existing `'use client'` directive:

```tsx
import { Toggle } from './Toggle'
```

Then remove the inline `Toggle` function definition (the entire `function Toggle({ checked, onChange, disabled }: { ... }) { ... }` block). The rest of the file is unchanged.

- [ ] **Step 3: Verify the build compiles**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Commit**

```bash
git add src/app/admin/Toggle.tsx src/app/admin/BarberManagementPanel.tsx
git commit -m "refactor: extract Toggle to shared admin component"
```

---

## Task 3: Services API — GET + POST

**Files:**
- Create: `src/app/api/owner/services/route.ts`

- [ ] **Step 1: Create `src/app/api/owner/services/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'

export async function GET(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('services')
    .select('id, name, duration_minutes, price, is_active, display_order')
    .eq('shop_id', shopId)
    .order('display_order', { ascending: true })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function POST(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { shop_id, name, duration_minutes, price } = body as Record<string, unknown>

  if (!shop_id || typeof shop_id !== 'string') {
    return NextResponse.json({ error: 'shop_id is required' }, { status: 400 })
  }
  if (!name || typeof name !== 'string' || !(name as string).trim()) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 })
  }
  if (typeof duration_minutes !== 'number' || !Number.isInteger(duration_minutes) || duration_minutes <= 0) {
    return NextResponse.json({ error: 'duration_minutes must be an integer greater than 0' }, { status: 400 })
  }
  if (typeof price !== 'number' || price < 0) {
    return NextResponse.json({ error: 'price must be 0 or greater' }, { status: 400 })
  }

  const admin = createAdminClient()

  const { count } = await admin
    .from('services')
    .select('id', { count: 'exact', head: true })
    .eq('shop_id', shop_id)

  const { data, error: dbError } = await admin
    .from('services')
    .insert({
      shop_id,
      name: (name as string).trim(),
      duration_minutes,
      price,
      is_active: true,
      display_order: (count ?? 0) + 1,
    } as never)
    .select('id, name, duration_minutes, price, is_active, display_order')
    .single()

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data, { status: 201 })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Smoke test GET**

With the dev server running (`npm run dev`), open:
```
http://localhost:3000/api/owner/services?shop_id=<your-shop-id>
```

Expected: JSON array (empty `[]` if no services yet, or existing services)

- [ ] **Step 4: Smoke test POST**

```bash
curl -X POST http://localhost:3000/api/owner/services \
  -H "Content-Type: application/json" \
  -d '{"shop_id":"<your-shop-id>","name":"Haircut","duration_minutes":30,"price":25}'
```

Expected: 201 with the created service row including `id` and `is_active: true`

- [ ] **Step 5: Commit**

```bash
git add src/app/api/owner/services/route.ts
git commit -m "feat: add GET + POST /api/owner/services"
```

---

## Task 4: Services API — PATCH

**Files:**
- Create: `src/app/api/owner/services/[id]/route.ts`

- [ ] **Step 1: Create `src/app/api/owner/services/[id]/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'

const ALLOWED_FIELDS = new Set(['name', 'duration_minutes', 'price', 'is_active'])

export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params
  if (!id) return NextResponse.json({ error: 'Missing service id' }, { status: 400 })

  let body: Record<string, unknown>
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const patch: Record<string, unknown> = {}
  for (const key of Object.keys(body)) {
    if (ALLOWED_FIELDS.has(key)) patch[key] = body[key]
  }
  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'No valid fields to update' }, { status: 400 })
  }

  if ('name' in patch) {
    if (typeof patch.name !== 'string' || !(patch.name as string).trim()) {
      return NextResponse.json({ error: 'name must be a non-empty string' }, { status: 400 })
    }
    patch.name = (patch.name as string).trim()
  }
  if ('duration_minutes' in patch) {
    const d = patch.duration_minutes
    if (typeof d !== 'number' || !Number.isInteger(d) || d <= 0) {
      return NextResponse.json({ error: 'duration_minutes must be an integer greater than 0' }, { status: 400 })
    }
  }
  if ('price' in patch) {
    const p = patch.price
    if (typeof p !== 'number' || p < 0) {
      return NextResponse.json({ error: 'price must be 0 or greater' }, { status: 400 })
    }
  }
  if ('is_active' in patch) {
    if (typeof patch.is_active !== 'boolean') {
      return NextResponse.json({ error: 'is_active must be a boolean' }, { status: 400 })
    }
  }

  const admin = createAdminClient()
  const { data, error } = await admin
    .from('services')
    .update(patch as never)
    .eq('id', id)
    .select('id, name, duration_minutes, price, is_active, display_order')
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json(data)
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Smoke test PATCH name**

Replace `<service-id>` with an id returned by the POST in Task 3:

```bash
curl -X PATCH http://localhost:3000/api/owner/services/<service-id> \
  -H "Content-Type: application/json" \
  -d '{"name":"Fade"}'
```

Expected: 200 with updated row, `name: "Fade"`

- [ ] **Step 4: Smoke test PATCH is_active**

```bash
curl -X PATCH http://localhost:3000/api/owner/services/<service-id> \
  -H "Content-Type: application/json" \
  -d '{"is_active":false}'
```

Expected: 200 with `is_active: false`

- [ ] **Step 5: Smoke test validation rejection**

```bash
curl -X PATCH http://localhost:3000/api/owner/services/<service-id> \
  -H "Content-Type: application/json" \
  -d '{"duration_minutes":-5}'
```

Expected: 400 with `{ "error": "duration_minutes must be an integer greater than 0" }`

- [ ] **Step 6: Commit**

```bash
git add "src/app/api/owner/services/[id]/route.ts"
git commit -m "feat: add PATCH /api/owner/services/[id]"
```

---

## Task 5: Hours API — GET + PUT

**Files:**
- Create: `src/app/api/owner/hours/route.ts`

Note: PUT uses DELETE + INSERT (not upsert) because PostgreSQL's standard UNIQUE constraint treats NULL values as distinct — rows with `barber_id = NULL` would not conflict with each other on upsert. DELETE + INSERT is safe for this admin-only endpoint.

- [ ] **Step 1: Create `src/app/api/owner/hours/route.ts`**

```ts
import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { requireShopId } from '@/lib/shop-resolver'
import { validateHoursRow, type HoursRow } from '@/lib/owner/hours-validation'

export async function GET(req: NextRequest) {
  const { shopId, error } = requireShopId(req)
  if (error) return NextResponse.json(error, { status: 400 })

  const admin = createAdminClient()
  const { data, error: dbError } = await admin
    .from('business_hours')
    .select('day_of_week, open_time, close_time, is_closed')
    .eq('shop_id', shopId)
    .is('barber_id', null)
    .order('day_of_week', { ascending: true })

  if (dbError) return NextResponse.json({ error: dbError.message }, { status: 500 })

  return NextResponse.json(data ?? [])
}

export async function PUT(req: NextRequest) {
  let body: unknown
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { shop_id, hours } = body as { shop_id?: string; hours?: unknown[] }

  if (!shop_id || typeof shop_id !== 'string') {
    return NextResponse.json({ error: 'shop_id is required' }, { status: 400 })
  }
  if (!Array.isArray(hours) || hours.length === 0) {
    return NextResponse.json({ error: 'hours must be a non-empty array' }, { status: 400 })
  }

  // Validate all rows before any DB write
  for (const row of hours) {
    const err = validateHoursRow(row as HoursRow)
    if (err) return NextResponse.json({ error: err }, { status: 400 })
  }

  const admin = createAdminClient()

  // Delete existing shop-level rows, then insert fresh
  const { error: deleteError } = await admin
    .from('business_hours')
    .delete()
    .eq('shop_id', shop_id)
    .is('barber_id', null)

  if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 })

  const rows = (hours as HoursRow[]).map(h => ({
    shop_id,
    barber_id: null,
    day_of_week: h.day_of_week,
    open_time: h.open_time,
    close_time: h.close_time,
    is_closed: h.is_closed,
  }))

  const { error: insertError } = await admin
    .from('business_hours')
    .insert(rows as never[])

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 })

  return NextResponse.json({ ok: true })
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Smoke test GET**

```
http://localhost:3000/api/owner/hours?shop_id=<your-shop-id>
```

Expected: JSON array of existing business_hours rows (may be empty)

- [ ] **Step 4: Smoke test PUT — valid payload**

```bash
curl -X PUT http://localhost:3000/api/owner/hours \
  -H "Content-Type: application/json" \
  -d '{
    "shop_id": "<your-shop-id>",
    "hours": [
      {"day_of_week":0,"open_time":"10:00","close_time":"17:00","is_closed":true},
      {"day_of_week":1,"open_time":"09:00","close_time":"18:00","is_closed":false},
      {"day_of_week":2,"open_time":"09:00","close_time":"18:00","is_closed":false},
      {"day_of_week":3,"open_time":"09:00","close_time":"18:00","is_closed":false},
      {"day_of_week":4,"open_time":"09:00","close_time":"18:00","is_closed":false},
      {"day_of_week":5,"open_time":"09:00","close_time":"19:00","is_closed":false},
      {"day_of_week":6,"open_time":"10:00","close_time":"17:00","is_closed":false}
    ]
  }'
```

Expected: `{"ok":true}`

- [ ] **Step 5: Smoke test PUT — validation rejection**

```bash
curl -X PUT http://localhost:3000/api/owner/hours \
  -H "Content-Type: application/json" \
  -d '{
    "shop_id": "<your-shop-id>",
    "hours": [
      {"day_of_week":1,"open_time":"18:00","close_time":"09:00","is_closed":false}
    ]
  }'
```

Expected: 400 with `{ "error": "Monday: open_time must be earlier than close_time" }`

- [ ] **Step 6: Run full test suite to confirm no regressions**

```bash
npm test
```

Expected: all tests pass

- [ ] **Step 7: Commit**

```bash
git add src/app/api/owner/hours/route.ts
git commit -m "feat: add GET + PUT /api/owner/hours"
```

---

## Task 6: ServicesPanel component

**Files:**
- Create: `src/app/admin/ServicesPanel.tsx`

- [ ] **Step 1: Create `src/app/admin/ServicesPanel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Toggle } from './Toggle'

interface Service {
  id: string
  name: string
  duration_minutes: number
  price: number
  is_active: boolean
  display_order: number
}

interface Props {
  shopId: string
}

export function ServicesPanel({ shopId }: Props) {
  const [services, setServices] = useState<Service[]>([])
  const [saving, setSaving] = useState<Record<string, boolean>>({})
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [editingName, setEditingName] = useState<Record<string, string | null>>({})
  const [editingDuration, setEditingDuration] = useState<Record<string, string | null>>({})
  const [editingPrice, setEditingPrice] = useState<Record<string, string | null>>({})
  const [adding, setAdding] = useState(false)
  const [addForm, setAddForm] = useState({ name: '', duration: '', price: '' })
  const [addSaving, setAddSaving] = useState(false)
  const [addError, setAddError] = useState('')

  useEffect(() => {
    fetch(`/api/owner/services?shop_id=${encodeURIComponent(shopId)}`)
      .then(r => r.json())
      .then(data => setServices(data as Service[]))
      .catch(() => {})
  }, [shopId])

  async function patchService(id: string, patch: Partial<Service>) {
    setSaving(p => ({ ...p, [id]: true }))
    setErrors(p => ({ ...p, [id]: '' }))
    try {
      const res = await fetch(`/api/owner/services/${id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed')
      setServices(prev => prev.map(s => s.id === id ? { ...s, ...(data as Service) } : s))
    } catch (err) {
      setErrors(p => ({ ...p, [id]: (err as Error).message }))
    } finally {
      setSaving(p => ({ ...p, [id]: false }))
    }
  }

  async function commitName(id: string) {
    const val = editingName[id]
    if (val == null) return
    setEditingName(p => ({ ...p, [id]: null }))
    if (!val.trim()) return
    const current = services.find(s => s.id === id)
    if (current && val.trim() === current.name) return
    await patchService(id, { name: val.trim() })
  }

  async function commitDuration(id: string) {
    const val = editingDuration[id]
    if (val == null) return
    setEditingDuration(p => ({ ...p, [id]: null }))
    const num = parseInt(val, 10)
    if (isNaN(num) || num <= 0) return
    const current = services.find(s => s.id === id)
    if (current && num === current.duration_minutes) return
    await patchService(id, { duration_minutes: num })
  }

  async function commitPrice(id: string) {
    const val = editingPrice[id]
    if (val == null) return
    setEditingPrice(p => ({ ...p, [id]: null }))
    const num = parseFloat(val)
    if (isNaN(num) || num < 0) return
    const current = services.find(s => s.id === id)
    if (current && num === current.price) return
    await patchService(id, { price: num })
  }

  async function submitAdd() {
    const name = addForm.name.trim()
    const duration = parseInt(addForm.duration, 10)
    const price = parseFloat(addForm.price)
    if (!name) { setAddError('Name is required'); return }
    if (isNaN(duration) || duration <= 0) { setAddError('Duration must be greater than 0'); return }
    if (isNaN(price) || price < 0) { setAddError('Price must be 0 or greater'); return }

    setAddSaving(true)
    setAddError('')
    try {
      const res = await fetch('/api/owner/services', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, name, duration_minutes: duration, price }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Failed to add service')
      setServices(prev => [...prev, data as Service])
      setAdding(false)
      setAddForm({ name: '', duration: '', price: '' })
    } catch (err) {
      setAddError((err as Error).message)
    } finally {
      setAddSaving(false)
    }
  }

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-white font-semibold text-sm tracking-wide uppercase">Services</h2>
        {!adding && (
          <button
            onClick={() => setAdding(true)}
            className="text-xs px-3 py-1.5 rounded-lg bg-secondary-700 hover:bg-secondary-600 text-secondary-200 hover:text-white transition-colors"
          >
            + Add service
          </button>
        )}
      </div>

      <div className="flex flex-col gap-2">
        {services.map(service => {
          const isSaving = saving[service.id]
          const error = errors[service.id]

          return (
            <div key={service.id} className="flex flex-col gap-1">
              <div
                className={`flex items-center gap-3 px-3 py-2 rounded-lg border ${
                  service.is_active
                    ? 'bg-secondary-800 border-secondary-700'
                    : 'bg-secondary-900 border-secondary-800 opacity-50'
                }`}
              >
                {/* Name */}
                <div className="flex-1 min-w-0">
                  {editingName[service.id] != null ? (
                    <input
                      autoFocus
                      value={editingName[service.id] ?? ''}
                      onChange={e => setEditingName(p => ({ ...p, [service.id]: e.target.value }))}
                      onBlur={() => commitName(service.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitName(service.id) }}
                      className="w-full bg-secondary-700 border border-secondary-600 rounded px-2 py-0.5 text-white text-sm focus:outline-none focus:border-primary-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingName(p => ({ ...p, [service.id]: service.name }))}
                      className="text-white text-sm text-left truncate hover:text-primary-300 transition-colors w-full"
                    >
                      {service.name}
                    </button>
                  )}
                </div>

                {/* Duration */}
                <div className="w-20 flex-shrink-0">
                  {editingDuration[service.id] != null ? (
                    <input
                      autoFocus
                      type="number"
                      value={editingDuration[service.id] ?? ''}
                      onChange={e => setEditingDuration(p => ({ ...p, [service.id]: e.target.value }))}
                      onBlur={() => commitDuration(service.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitDuration(service.id) }}
                      className="w-full bg-secondary-700 border border-secondary-600 rounded px-2 py-0.5 text-white text-sm text-right focus:outline-none focus:border-primary-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingDuration(p => ({ ...p, [service.id]: String(service.duration_minutes) }))}
                      className="text-secondary-300 text-sm hover:text-white transition-colors w-full text-right"
                    >
                      {service.duration_minutes}m
                    </button>
                  )}
                </div>

                {/* Price */}
                <div className="w-20 flex-shrink-0">
                  {editingPrice[service.id] != null ? (
                    <input
                      autoFocus
                      type="number"
                      step="0.01"
                      value={editingPrice[service.id] ?? ''}
                      onChange={e => setEditingPrice(p => ({ ...p, [service.id]: e.target.value }))}
                      onBlur={() => commitPrice(service.id)}
                      onKeyDown={e => { if (e.key === 'Enter') commitPrice(service.id) }}
                      className="w-full bg-secondary-700 border border-secondary-600 rounded px-2 py-0.5 text-white text-sm text-right focus:outline-none focus:border-primary-400"
                    />
                  ) : (
                    <button
                      onClick={() => setEditingPrice(p => ({ ...p, [service.id]: String(service.price) }))}
                      className="text-secondary-300 text-sm hover:text-white transition-colors w-full text-right"
                    >
                      ${service.price.toFixed(2)}
                    </button>
                  )}
                </div>

                {/* Active toggle */}
                <Toggle
                  checked={service.is_active}
                  disabled={isSaving}
                  onChange={v => patchService(service.id, { is_active: v })}
                />
              </div>

              {error && (
                <p className="text-red-400 text-xs px-3">{error}</p>
              )}
            </div>
          )
        })}

        {/* Add form */}
        {adding && (
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2 px-3 py-2 rounded-lg border bg-secondary-800 border-secondary-600">
              <input
                autoFocus
                placeholder="Name"
                value={addForm.name}
                onChange={e => setAddForm(p => ({ ...p, name: e.target.value }))}
                className="flex-1 bg-secondary-700 border border-secondary-600 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-400"
              />
              <input
                type="number"
                placeholder="Min"
                value={addForm.duration}
                onChange={e => setAddForm(p => ({ ...p, duration: e.target.value }))}
                className="w-16 bg-secondary-700 border border-secondary-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-primary-400"
              />
              <input
                type="number"
                step="0.01"
                placeholder="$"
                value={addForm.price}
                onChange={e => setAddForm(p => ({ ...p, price: e.target.value }))}
                className="w-20 bg-secondary-700 border border-secondary-600 rounded px-2 py-1 text-white text-sm text-right focus:outline-none focus:border-primary-400"
              />
              <button
                onClick={submitAdd}
                disabled={addSaving}
                className="px-3 py-1 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
              >
                {addSaving ? 'Saving…' : 'Save'}
              </button>
              <button
                onClick={() => {
                  setAdding(false)
                  setAddForm({ name: '', duration: '', price: '' })
                  setAddError('')
                }}
                className="px-3 py-1 rounded-lg bg-secondary-700 hover:bg-secondary-600 text-secondary-300 hover:text-white text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
            {addError && <p className="text-red-400 text-xs px-3">{addError}</p>}
          </div>
        )}
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/ServicesPanel.tsx
git commit -m "feat: add ServicesPanel admin component"
```

---

## Task 7: BusinessHoursPanel component

**Files:**
- Create: `src/app/admin/BusinessHoursPanel.tsx`

- [ ] **Step 1: Create `src/app/admin/BusinessHoursPanel.tsx`**

```tsx
'use client'

import { useEffect, useState } from 'react'
import { Toggle } from './Toggle'

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

interface DayHours {
  day_of_week: number
  open_time: string
  close_time: string
  is_closed: boolean
}

const DEFAULT_HOURS: DayHours[] = DAY_NAMES.map((_, i) => ({
  day_of_week: i,
  open_time: '09:00',
  close_time: '18:00',
  is_closed: false,
}))

interface Props {
  shopId: string
}

export function BusinessHoursPanel({ shopId }: Props) {
  const [hours, setHours] = useState<DayHours[]>(DEFAULT_HOURS)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch(`/api/owner/hours?shop_id=${encodeURIComponent(shopId)}`)
      .then(r => r.json())
      .then((data: DayHours[]) => {
        const merged = DEFAULT_HOURS.map(def => {
          const row = data.find(r => r.day_of_week === def.day_of_week)
          return row ?? def
        })
        setHours(merged)
      })
      .catch(() => {})
  }, [shopId])

  function updateDay(dayOfWeek: number, patch: Partial<DayHours>) {
    setHours(prev => prev.map(h => h.day_of_week === dayOfWeek ? { ...h, ...patch } : h))
  }

  async function saveHours() {
    setSaving(true)
    setSaved(false)
    setError('')
    try {
      const res = await fetch('/api/owner/hours', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shop_id: shopId, hours }),
      })
      const data = await res.json()
      if (!res.ok) throw new Error((data as { error?: string }).error ?? 'Save failed')
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setSaving(false)
    }
  }

  return (
    <section className="border-t border-secondary-800 px-6 py-5">
      <div className="flex items-center gap-3 mb-4">
        <h2 className="text-white font-semibold text-sm tracking-wide uppercase">Business Hours</h2>
        {saved && <span className="text-emerald-400 text-xs font-medium">Saved ✓</span>}
        {error && <span className="text-red-400 text-xs">{error}</span>}
      </div>

      <div className="flex flex-col gap-2">
        {hours.map(day => (
          <div key={day.day_of_week} className="flex items-center gap-3">
            <span className="text-secondary-300 text-sm w-24 flex-shrink-0">{DAY_NAMES[day.day_of_week]}</span>
            <input
              type="text"
              value={day.open_time}
              disabled={day.is_closed}
              onChange={e => updateDay(day.day_of_week, { open_time: e.target.value })}
              placeholder="09:00"
              className="w-20 bg-secondary-800 border border-secondary-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-secondary-500 text-sm">–</span>
            <input
              type="text"
              value={day.close_time}
              disabled={day.is_closed}
              onChange={e => updateDay(day.day_of_week, { close_time: e.target.value })}
              placeholder="18:00"
              className="w-20 bg-secondary-800 border border-secondary-700 rounded px-2 py-1 text-white text-sm focus:outline-none focus:border-primary-400 disabled:opacity-40 disabled:cursor-not-allowed"
            />
            <span className="text-secondary-400 text-xs ml-auto">Closed</span>
            <Toggle
              checked={day.is_closed}
              onChange={v => updateDay(day.day_of_week, { is_closed: v })}
            />
          </div>
        ))}
      </div>

      <div className="mt-4">
        <button
          onClick={saveHours}
          disabled={saving}
          className="px-4 py-2 rounded-lg bg-primary-500 hover:bg-primary-400 text-white text-sm font-medium transition-colors disabled:opacity-50"
        >
          {saving ? 'Saving…' : 'Save hours'}
        </button>
      </div>
    </section>
  )
}
```

- [ ] **Step 2: Verify TypeScript**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 3: Commit**

```bash
git add src/app/admin/BusinessHoursPanel.tsx
git commit -m "feat: add BusinessHoursPanel admin component"
```

---

## Task 8: Wire panels into AdminDashboard + end-to-end verification

**Files:**
- Modify: `src/app/admin/AdminDashboard.tsx`

- [ ] **Step 1: Add imports to `AdminDashboard.tsx`**

At the top of `src/app/admin/AdminDashboard.tsx`, after the existing import block, add:

```tsx
import { ServicesPanel } from './ServicesPanel'
import { BusinessHoursPanel } from './BusinessHoursPanel'
```

- [ ] **Step 2: Append panels to the return**

In `src/app/admin/AdminDashboard.tsx`, locate the closing `</div>` of the outer `min-h-screen` div. The current last panel before it is `<UISettingsPanel shopId={shopId} />`. Add immediately after it:

```tsx
      <ServicesPanel shopId={shopId} />
      <BusinessHoursPanel shopId={shopId} />
```

The bottom of the return should look like:

```tsx
      {/* Display background customization */}
      <DisplayBackgroundsPanel />

      {/* TV display UI settings */}
      <UISettingsPanel shopId={shopId} />

      {/* Services setup */}
      <ServicesPanel shopId={shopId} />

      {/* Business hours setup */}
      <BusinessHoursPanel shopId={shopId} />
    </div>
  )
```

- [ ] **Step 3: Final TypeScript check**

```bash
npx tsc --noEmit
```

Expected: no errors

- [ ] **Step 4: Run full test suite**

```bash
npm test
```

Expected: all tests pass, including the 11 hours-validation tests from Task 1

- [ ] **Step 5: End-to-end smoke test — Services**

Open `http://localhost:3000/admin` and scroll to the Services section. Verify:

- [ ] Services list loads (empty if none exist yet)
- [ ] Click "+ Add service" → inline form appears
- [ ] Enter name "Haircut", duration "30", price "25" → click Save → service appears in list
- [ ] Click the service name → input appears → change to "Fade" → press Enter → name updates
- [ ] Click duration "30" → change to "45" → blur → updates to 45m
- [ ] Click the active toggle → service greys out (is_active: false)
- [ ] Click toggle again → service re-activates
- [ ] Click "+ Add service" → leave name empty → click Save → see "Name is required" error

- [ ] **Step 6: End-to-end smoke test — Business Hours**

Scroll to the Business Hours section. Verify:

- [ ] All 7 days render with default times (09:00 – 18:00)
- [ ] Toggle Sunday "Closed" → time inputs grey out and become disabled
- [ ] Change Monday open_time to "10:00"
- [ ] Click "Save hours" → "Saved ✓" appears and disappears after ~2s
- [ ] Reload the page → Monday open_time is still "10:00", Sunday is still Closed
- [ ] Set a day's close_time earlier than open_time (e.g., Monday 18:00 → 08:00) → click Save → see server error "Monday: open_time must be earlier than close_time"

- [ ] **Step 7: Final commit**

```bash
git add src/app/admin/AdminDashboard.tsx
git commit -m "feat: add ServicesPanel and BusinessHoursPanel to /admin"
```

---

## What Was Deferred

- Per-barber hours overrides (barber_id != null rows)
- Service delete (toggle inactive is sufficient for launch)
- Service display_order drag-to-reorder
- Service categories, deposit amounts, description field
- Analytics, reporting, advanced owner tooling
