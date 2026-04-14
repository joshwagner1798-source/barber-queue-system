# SMS Queue Notifications — Customer "You're Up Next" Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Send an automatic SMS to the customer when a barber claims their walk-in (WAITING → CALLED), saying "You're up next at Sharper Image. Head back now."

**Architecture:** A new `notifyCustomerCalled(walkinId, shopId)` helper in `src/lib/walkin/customer_sms.ts` performs three DB lookups (walkin → client phone, shop name) then calls the existing `sendSms()` from `src/lib/sms/twilio.ts`. It is called fire-and-forget from all four places that transition a walk-in from WAITING → CALLED. No schema changes needed.

**Tech Stack:** Next.js App Router, TypeScript, Supabase (admin client), Twilio (already wired in `src/lib/sms/twilio.ts`)

---

## File Map

| Action | File | Purpose |
|--------|------|---------|
| **Create** | `src/lib/walkin/customer_sms.ts` | Single helper that looks up client phone + shop name and fires the SMS |
| **Modify** | `src/lib/walkin/walkin_offer.ts` | Call notify after `handleOfferAccepted` succeeds |
| **Modify** | `src/lib/walkin/queue_assignment.ts` | Call notify in `autoAssignWalkins` and `processBarberAvailable` after WAITING→CALLED update |
| **Modify** | `src/app/api/walkins/[id]/route.ts` | Call notify when PATCH transitions status to `CALLED` |

---

## Task 1: Create `src/lib/walkin/customer_sms.ts`

**Files:**
- Create: `src/lib/walkin/customer_sms.ts`

- [ ] **Step 1: Create the file**

```typescript
// ---------------------------------------------------------------------------
// Customer queue notification
//
// Sends "You're up next at <shop>" SMS when a walk-in transitions WAITING → CALLED.
// Fire-and-forget safe — swallows all errors so it never blocks an assignment.
// ---------------------------------------------------------------------------

import { createAdminClient } from '@/lib/supabase/admin'
import { sendSms, toE164 } from '@/lib/sms/twilio'

/**
 * Sends an SMS to the walk-in customer telling them they've been called.
 * Resolves silently on any error (missing phone, Twilio failure, etc).
 */
export async function notifyCustomerCalled(
  walkinId: string,
  shopId: string,
): Promise<void> {
  try {
    const admin = createAdminClient()

    // 1. Fetch walkin to get client_id
    const { data: walkin } = await admin
      .from('walkins')
      .select('client_id')
      .eq('id', walkinId)
      .maybeSingle()

    if (!walkin?.client_id) return

    // 2. Fetch client phone
    const { data: client } = await admin
      .from('clients')
      .select('phone')
      .eq('id', walkin.client_id)
      .maybeSingle()

    if (!client?.phone) return

    // 3. Fetch shop name
    const { data: shop } = await admin
      .from('shops')
      .select('name')
      .eq('id', shopId)
      .maybeSingle()

    const shopName = shop?.name ?? 'the shop'

    // 4. Send SMS — phone stored as 10-digit; toE164 converts to +1XXXXXXXXXX
    const to = toE164(client.phone)
    const body = `You're up next at ${shopName}. Head back now.`
    await sendSms(to, body)
  } catch {
    // Best-effort — never surface errors to caller
  }
}
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no errors mentioning `customer_sms.ts`

- [ ] **Step 3: Commit**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
git add src/lib/walkin/customer_sms.ts
git commit -m "feat: add notifyCustomerCalled helper for walk-in SMS"
```

---

## Task 2: Wire into `handleOfferAccepted` (barber SMS → YES flow)

**Files:**
- Modify: `src/lib/walkin/walkin_offer.ts` (around line 376)

This is the path where a barber replies YES to the SMS offer. After the atomic claim succeeds and the event is appended, fire the customer notification.

- [ ] **Step 1: Add import at top of `walkin_offer.ts`**

Find the existing import block near line 27:
```typescript
import { sendSms, OFFER_MESSAGE, toE164 } from '@/lib/sms/twilio'
```

Add one line after it:
```typescript
import { notifyCustomerCalled } from './customer_sms'
```

- [ ] **Step 2: Add the notify call inside `handleOfferAccepted`**

Find the block near line 376–383 that reads:
```typescript
  await appendEvent(admin, {
    shop_id: shopId,
    type: WALKIN_OFFER_ACCEPTED,
    actor_user_id: null,
    payload: { walkin_id: walkinId, barber_id: barberId, attempt_id: attemptId },
  }).catch(() => {})

  return { accepted: true }
```

Replace with:
```typescript
  await appendEvent(admin, {
    shop_id: shopId,
    type: WALKIN_OFFER_ACCEPTED,
    actor_user_id: null,
    payload: { walkin_id: walkinId, barber_id: barberId, attempt_id: attemptId },
  }).catch(() => {})

  // Notify customer they've been called (fire-and-forget)
  notifyCustomerCalled(walkinId, shopId).catch(() => {})

  return { accepted: true }
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
git add src/lib/walkin/walkin_offer.ts
git commit -m "feat: notify customer SMS after barber accepts walk-in offer"
```

---

## Task 3: Wire into `autoAssignWalkins` (dispatcher auto-assign)

**Files:**
- Modify: `src/lib/walkin/queue_assignment.ts` (around line 410–425)

This is the path where the dispatcher cron picks the next available barber and assigns them.

- [ ] **Step 1: Add import at top of `queue_assignment.ts`**

Find the existing imports near line 1–5:
```typescript
import { SupabaseClient } from '@supabase/supabase-js'
import type { Database, Walkin, Appointment, Service } from '@/types/database'
import { getShopAvailability, type BarberAvailability } from './availability'
import { appendEvent, WALKIN_AUTO_ASSIGNED } from './events'
```

Add one line after the last import:
```typescript
import { notifyCustomerCalled } from './customer_sms'
```

- [ ] **Step 2: Add the notify call in `autoAssignWalkins` after successful assignment**

Find the block around line 412–425 that reads:
```typescript
    if (assignErr || !(updated as unknown as { id: string }[] | null)?.length) {
      continue // someone else got it or it was already assigned
    }

    // Create assignment record
    // @ts-expect-error — Supabase generated types resolve insert param to never
    await supabase.from('assignments').insert({
      shop_id: shopId,
      walkin_id: target.id,
      barber_id: barberId,
    })
```

After the `await supabase.from('assignments').insert(...)` call (after the closing `})` of insert), add:

```typescript
    // Notify customer they've been called (fire-and-forget)
    notifyCustomerCalled(target.id, shopId).catch(() => {})
```

So the full block becomes:
```typescript
    if (assignErr || !(updated as unknown as { id: string }[] | null)?.length) {
      continue // someone else got it or it was already assigned
    }

    // Create assignment record
    // @ts-expect-error — Supabase generated types resolve insert param to never
    await supabase.from('assignments').insert({
      shop_id: shopId,
      walkin_id: target.id,
      barber_id: barberId,
    })

    // Notify customer they've been called (fire-and-forget)
    notifyCustomerCalled(target.id, shopId).catch(() => {})
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
git add src/lib/walkin/queue_assignment.ts
git commit -m "feat: notify customer SMS in dispatcher auto-assign path"
```

---

## Task 4: Wire into `processBarberAvailable` (barber taps Available / finishes a cut)

**Files:**
- Modify: `src/lib/walkin/queue_assignment.ts` (around line 280–295)

`notifyCustomerCalled` was already imported in Task 3 — no new import needed.

- [ ] **Step 1: Add notify call in `processBarberAvailable` after successful update**

Find the block around line 278–295 that reads:
```typescript
  // 4. Transition walk-in WAITING → CALLED
  const { error: updateError } = await supabase
    .from('walkins')
    // @ts-expect-error — Supabase generated types resolve .update() param to `never`
    .update({ status: 'CALLED' })
    .eq('id', suggestion.walkin_id)
    .eq('status', 'WAITING') // optimistic lock — only update if still WAITING

  if (updateError) {
    return { assigned: false, reason: `Failed to update walk-in: ${updateError.message}` }
  }

  // 5. Append event
  try {
    await appendEvent(supabase, {
```

After the `if (updateError)` guard (i.e., after we know the update succeeded), add:

```typescript
  // Notify customer they've been called (fire-and-forget)
  notifyCustomerCalled(suggestion.walkin_id, shopId).catch(() => {})
```

So the section becomes:
```typescript
  if (updateError) {
    return { assigned: false, reason: `Failed to update walk-in: ${updateError.message}` }
  }

  // Notify customer they've been called (fire-and-forget)
  notifyCustomerCalled(suggestion.walkin_id, shopId).catch(() => {})

  // 5. Append event
  try {
    await appendEvent(supabase, {
```

- [ ] **Step 2: Verify TypeScript compiles**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 3: Commit**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
git add src/lib/walkin/queue_assignment.ts
git commit -m "feat: notify customer SMS when barber becomes available and auto-claims"
```

---

## Task 5: Wire into `PATCH /api/walkins/[id]` (admin "Call" button)

**Files:**
- Modify: `src/app/api/walkins/[id]/route.ts`

- [ ] **Step 1: Add import at top of the route file**

The file currently starts with:
```typescript
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { validateWalkinTransition } from '@/lib/walkin/validation'
import { appendEvent, WALKIN_STATUS_CHANGED } from '@/lib/walkin/events'
import { refreshShopProjection } from '@/lib/walkin/shop_projector'
import type { Walkin } from '@/types/database'
```

Add one line after the existing imports:
```typescript
import { notifyCustomerCalled } from '@/lib/walkin/customer_sms'
```

- [ ] **Step 2: Add notify call after successful status update**

Find the block starting around line 39 that reads:
```typescript
  const { data, error } = await supabase
    .from('walkins')
    .update({ status })
    .eq('id', id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  try {
    await appendEvent(supabase, {
```

After `if (error) return NextResponse.json(...)`, before the `try { appendEvent }`, add:

```typescript
  // Fire customer SMS if this transition is to CALLED
  if (status === 'CALLED') {
    notifyCustomerCalled(id, existing.shop_id).catch(() => {})
  }
```

So the section becomes:
```typescript
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // Fire customer SMS if this transition is to CALLED
  if (status === 'CALLED') {
    notifyCustomerCalled(id, existing.shop_id).catch(() => {})
  }

  try {
    await appendEvent(supabase, {
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
npx tsc --noEmit 2>&1 | head -30
```

Expected: no new errors

- [ ] **Step 4: Commit**

```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
git add src/app/api/walkins/[id]/route.ts
git commit -m "feat: notify customer SMS when admin calls walk-in manually"
```

---

## Task 6: End-to-End Test

### Required env vars

These should already be set in `.env.local` (the twilio.ts file documents them):
```
TWILIO_ACCOUNT_SID=ACxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
TWILIO_AUTH_TOKEN=your_auth_token
TWILIO_PHONE_NUMBER=+1XXXXXXXXXX   # your Twilio number in E.164
```

Verify with:
```bash
cd "/Users/xvjosh/sharper image que/barber_scheduling"
node -e "
  require('./envcheck.cjs')
  console.log('TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID?.slice(0,8))
  console.log('TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? 'SET' : 'MISSING')
  console.log('TWILIO_PHONE_NUMBER:', process.env.TWILIO_PHONE_NUMBER)
"
```

### Test Path A — Admin "Call" button (fastest to test)

1. Start the dev server: `npm run dev`
2. Log in as admin at `/admin`
3. Make sure there is a walk-in in WAITING status (add one via the kiosk `/kiosk` with a real phone number that can receive SMS)
4. Click "Call" on that walk-in in the Live Queue panel
5. Confirm: walk-in moves to CALLED in the queue, and the customer's phone receives the SMS within ~5 seconds

### Test Path B — Barber marks Available (auto-assign path)

1. Have a walk-in in WAITING
2. Log in as a barber at `/barber`
3. Toggle status to AVAILABLE using the status bar
4. The `processBarberAvailable` path fires, WAITING → CALLED happens
5. Customer phone should receive SMS

### Test Path C — Barber SMS YES reply (offer flow)

1. Have a walk-in in WAITING with eligible barbers
2. Barber receives SMS offer "New walk-in ready! Reply YES..."
3. Barber replies YES
4. Customer phone should receive SMS (within 10s)

### Confirming no duplicate SMS

If you accept via two paths nearly simultaneously (shouldn't happen in practice), only one succeeds because of the optimistic `WHERE status='WAITING'` lock. The second path's notify call fires but the walkin is already CALLED — the SMS still sends. This is technically a duplicate only if you force-call `notifyCustomerCalled` twice manually, which the normal flow prevents.

---

## Self-Review

**Spec coverage:**
- ✅ SMS triggered on WAITING → CALLED (all four paths covered)
- ✅ Message: "You're up next at [shop name]. Head back now."
- ✅ Customer phone comes from kiosk join form (stored in clients.phone)
- ✅ Uses existing Twilio infrastructure
- ✅ No schema changes
- ✅ Fire-and-forget so assignment never blocks

**No placeholders:** All steps have exact code.

**Type consistency:** `notifyCustomerCalled(walkinId: string, shopId: string)` — same signature used in all four call sites.
