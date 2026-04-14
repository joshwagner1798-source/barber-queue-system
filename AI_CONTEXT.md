# GetShopQueue — Master AI Context File

> For AI coding assistants. Dense, accurate, code-grounded. Not marketing copy.
> Project path: `/Users/xvjosh/sharper image que/barber_scheduling/`
> Last updated from codebase: 2026-04-01

---

## Product Summary

Real-time barbershop operations platform. Manages walk-in queue traffic alongside Acuity Scheduling appointments. One deployed shop (Sharper Image). Core loop:

1. Customer checks in at `/kiosk` → atomic SQL RPC → `walkins` row (WAITING)
2. SMS offer sent via Twilio to idle-longest eligible barber (90s to respond)
3. Barber replies YES → `IN_SERVICE` + `assignments` record | NO/timeout → next barber
4. `/tv` page displays live floor state via Supabase Realtime
5. Dispatcher (`/api/dispatcher`, Bearer-auth POST) syncs Acuity → `barber_status`, then auto-assigns any WAITING walk-ins

Walk-ins and appointments coexist. Acuity is the barber availability source of truth. The queue system reads Acuity data but does not write to it.

---

## Stack

| Layer | Technology | Notes |
|---|---|---|
| Framework | Next.js 16 (App Router), TypeScript | `next.config.ts` ignores TS build errors — see Weak Points |
| Database | Supabase (Postgres + Auth + RLS + Realtime) | 19 migrations |
| Calendar | Acuity Scheduling REST API v1 + webhooks | First of potentially many providers |
| SMS | Twilio | Barber offer rotation, YES/NO responses |
| Deployment | Vercel | Only 1 active cron (see below) |
| Styling | Tailwind CSS 3.4, Framer Motion | |
| Testing | Vitest | Partial coverage — see Weak Points |

**Package name:** `barber-scheduling-tool`  
**Key deps:** `@supabase/ssr ^0.8.0`, `@supabase/supabase-js ^2.90.1`, `framer-motion ^12.35.0`, `next ^16.1.3`, `twilio ^5.12.2`

---

## Routes

### App Pages

| Route | Purpose | Auth |
|---|---|---|
| `/` | Landing page | Public |
| `/login` | Supabase Auth login | Public |
| `/signup` | User registration | Public |
| `/kiosk` | Walk-in check-in kiosk | Public (anon) |
| `/tv` | TV floor display (Realtime) | Public (anon) |
| `/tv-display` | Alternative TV layout | Public (anon) |
| `/barber` | Barber dashboard — my queue + status | Auth, role=barber |
| `/admin` | Shop config panels | Auth, role=admin\|owner |
| `/dashboard` | Owner live floor view | Auth, role=owner\|admin |
| `/sharperimage` | Shop-specific page | Check implementation |
| `/barber-cards` | Barber card display | Check implementation |
| `/[shopSlug]/tv` | Multi-shop TV route | Partially wired |

**Middleware** (`middleware.ts`) protects `/barber/*` and `/admin/*`. Checks `users.role` via `auth_id` lookup. Unrecognized auth → redirect `/login`.

### API Routes

| Method | Path | Auth | Purpose |
|---|---|---|---|
| POST | `/api/walkins` | Supabase Auth | Create walk-in (calls RPC + triggers SMS offer) |
| GET | `/api/walkins` | Supabase Auth | List WAITING/CALLED/IN_SERVICE |
| GET/PATCH | `/api/walkins/:id` | Supabase Auth | Single walkin get/update |
| GET/POST | `/api/barber-state` | Supabase Auth | Barber manual state CRUD |
| PATCH | `/api/barber-state/:id` | Supabase Auth | Update barber state |
| GET/POST | `/api/assignments` | Supabase Auth | Assignment CRUD |
| PATCH | `/api/assignments/:id` | Supabase Auth | End assignment |
| POST | `/api/dispatcher` | Bearer `DISPATCHER_SECRET` | Sync Acuity → barber_status + auto-assign |
| GET | `/api/jobs/walkin-timeouts` | Bearer `CRON_SECRET` or `WALKIN_TIMEOUT_SECRET` | Mark expired SMS offers, advance rotation |
| GET | `/api/jobs/reconcile-acuity` | Bearer `RECONCILE_SECRET` or `CRON_SECRET` | Full Acuity pull [-7d,+30d], repair drift |
| POST | `/api/webhooks/acuity` | None (idempotent) | Acuity webhook → provider_appointments |
| POST | `/api/sms-response` | Twilio signature (optional) | Barber YES/NO SMS reply |
| GET | `/api/tv` | Public | TV barber cards + queue data |
| GET | `/api/availability` | Public | Barber availability |
| GET | `/api/wait-time` | Public | Queue wait estimates |
| GET/POST | `/api/owner/barbers` | Auth, owner | Barber management |
| GET/POST | `/api/owner/services` | Auth, owner | Service management |
| GET/POST | `/api/owner/hours` | Auth, owner | Business hours |
| GET/POST | `/api/owner/settings` | Auth, owner | Shop settings |
| GET/POST | `/api/shop-settings` | Auth, owner | Shop config |
| GET/POST | `/api/barbers` | Auth | Barber list |
| GET/POST | `/api/events` | Auth | Event log |
| GET/POST | `/api/debug` | Dev | Debug tooling |
| GET/POST | `/api/kiosk/*` | Public | Kiosk barber/walkin lookups |
| GET/POST | `/api/barber-photos` | Auth | Photo management |
| GET | `/api/auth/*` | Supabase | Auth callbacks |

**Cron (vercel.json):** Only `GET /api/jobs/reconcile-acuity` at `0 8 * * *` (8am daily). The dispatcher and walkin-timeouts jobs are NOT in vercel.json — they must be called by an external scheduler (or invoked manually).

---

## Environment Variables

```bash
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=

ACUITY_USER_ID=
ACUITY_API_KEY=

TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_PHONE_NUMBER=

DISPATCHER_SECRET=         # POST /api/dispatcher
CRON_SECRET=               # Vercel cron injection + walkin-timeouts
WALKIN_TIMEOUT_SECRET=     # External scheduler calling walkin-timeouts
RECONCILE_SECRET=          # External scheduler calling reconcile-acuity

DEFAULT_SHOP_ID=00000000-0000-0000-0000-000000000001
```

---

## Database Architecture

### Migration Order (19 files)

```
00001 — core schema: shops, users, services, appointments, business_hours, time_blocks
00002 — initial RLS policies
00003 — walkin truth layer: walkins, barber_state, assignments, events, shop_state_projection
00004 — walkin RLS
00005 — kiosk layer: clients, barber_status, public_walkins/public_barbers views
        also adds to walkins: client_id, display_name, assigned_barber_id, called_at
        also adds to users: acuity_calendar_id
00006 — join_walkin_queue atomic RPC  ⚠️ NAME COLLISION: 00006_tv_tables.sql also exists
00007 — public views
00008 — TV realtime tables
00009 — TV barber_status projection
00010 — calendar ingest: calendar_connections, provider_appointments, provider_blocks,
         calendar_webhook_events
00011 — provider_appt client name
00012 — provider_blocks table
00013 — provider_blocks note_short
00014 — calendar_connections off_until
00015 — shop_settings
00016 — barber_photos_bucket
00017 — walkin SMS layer: walkin_enabled flag on users, walkin_assignment_attempts table
         Seeds walkin_enabled=false for barbers named 'Tyrik' and 'Will'
00018 — owner_settings
00019 — barber_photo_position
```

### Key Tables

**`shops`** — Multi-tenant root. One shop deployed. Fields: name, slug, timezone, currency.

**`users`** — All staff. `role`: customer | barber | admin | owner. Barber fields: bio, is_active, display_order, `acuity_calendar_id` (TEXT), `walkin_enabled` (BOOL, default true). `auth_id` → Supabase Auth.

**`walkins`** — Canonical queue.
- Status: `WAITING | CALLED | IN_SERVICE | NO_SHOW | DONE | REMOVED`
- Preference: `ANY | PREFERRED | FASTEST`
- Key cols: `position` (INT, compacted), `client_id` (FK→clients), `display_name`, `assigned_barber_id` (FK→users), `called_at`, `preferred_barber_id`
- Index: `(shop_id, status, position)`

**`clients`** — Phone dedup, PII-locked. Unique `(shop_id, phone)`. RLS: admin/owner only. Fields: first_name, last_initial, phone, display_name. Phone never surfaces outside this table.

**`barber_state`** — Manual barber shift state. PK: `(shop_id, barber_id)`.
- State: `AVAILABLE | IN_CHAIR | ON_BREAK | OFF | CLEANUP | OTHER`
- `state_since` TIMESTAMPTZ — drives SMS rotation order (idle-longest first)

**`barber_status`** — Acuity-computed status. Updated by dispatcher. PK: `(shop_id, barber_id)`.
- Status: `FREE | BUSY | UNAVAILABLE | OFF | UNKNOWN`
- `free_at` TIMESTAMPTZ — when barber next becomes available
- `status_detail` TEXT — block reason or "Wrapping up"
- `last_synced_at`

**`assignments`** — Barber ↔ walk-in link. `started_at`, `ended_at` (NULL while active).

**`events`** — Append-only audit log. `type` TEXT, `payload` JSONB, `actor_user_id`, `shop_id`. Never updated.

**`shop_state_projection`** — Denormalized JSONB snapshot. PK: `shop_id`. `snapshot` JSONB, `revision` BIGINT. Rebuilt by `refreshShopProjection()`. Not authoritative — derived read cache.

**`walkin_assignment_attempts`** — SMS offer rotation tracking.
- Status: `pending | accepted | declined | timeout | canceled`
- `expires_at = now() + 90s`
- Partial unique index: one `accepted` per walkin_id (prevents double-accept)
- Partial unique index: one `pending` per walkin_id (prevents offer spam)

**`calendar_connections`** — `(shop_id, barber_id, provider)` → `provider_calendar_id` (TEXT, never cast to int). `off_until_at` for long-term absences. `active` bool.

**`provider_appointments`** — Acuity-synced appointments. Separate from native `appointments`. Status: `ACTIVE | CANCELLED | DELETED`. `kind` field.

**`provider_blocks`** — Acuity-synced blocks. `note_short` TEXT for TV display.

**`calendar_webhook_events`** — Idempotent ledger. Unique `(provider, provider_event_id)`. Status: `RECEIVED → PROCESSED | ERROR`.

**`appointments`** — Native booking table (from 00001). Present, not active in core walk-in flow. Conflict-check in `queue_assignment.ts` reads from it for appointment buffer logic.

### Safe Public Views

- `public_walkins` — walkins without client_id or phone
- `public_barbers` — users without email or phone
- `tv_barber_status` — barber_status joined with user info

### RLS Summary

| Table/View | Anon | Auth | Service Role |
|---|---|---|---|
| `public_walkins` (view) | SELECT | SELECT | Full |
| `public_barbers` (view) | SELECT | SELECT | Full |
| `barber_status` | SELECT | SELECT | Full |
| `walkins` | — | Shop-scoped | Full |
| `clients` | — | Admin/owner only | Full |
| `walkin_assignment_attempts` | — | Admin/owner | Full |
| `calendar_connections` | — | Admin/owner | Full |
| `provider_appointments` | — | Shop-scoped | Full |

---

## Queue Logic

### Walk-In Creation

File: `src/lib/kiosk/actions.ts` → `submitWalkin()` → Supabase RPC `join_walkin_queue`

RPC (`supabase/migrations/00006_join_walkin_queue.sql`) is atomic:
1. Normalize phone (digits only)
2. Upsert `clients` on `(shop_id, phone)` → get `client_id`
3. Advisory lock on `shop_id` — serializes position assignment
4. Check existing active walkin for this client → return early if found (dedup)
5. `position = MAX(position) + 1` for WAITING walkins in shop
6. Insert `walkins` (WAITING)
7. Append `WALKIN_ADDED` event

After RPC: `POST /api/walkins` calls `initiateWalkinOffer()` (fire-and-forget) to start SMS rotation.

### SMS Offer Rotation

File: `src/lib/walkin/walkin_offer.ts`

```
Walk-in created
  → initiateWalkinOffer(admin, shopId, walkinId)
  → getEligibleBarbers() — filters eligibility + sorts idle-longest first, then display_order
  → skip barbers already tried for this walkin (excludeBarberIds)
  → sendSms() via Twilio
  → insert walkin_assignment_attempts (status=pending, expires_at=now+90s)

Barber replies YES → POST /api/sms-response
  → match phone → barber_id
  → mark attempt accepted
  → walkin → IN_SERVICE, assigned_barber_id set, called_at set
  → create assignments record
  → barber_state → IN_CHAIR

Barber replies NO → POST /api/sms-response
  → mark attempt declined
  → advanceOfferRotation() → next eligible barber

GET /api/jobs/walkin-timeouts (Bearer auth, call every ~2min externally)
  → find pending attempts where expires_at < now
  → mark timeout
  → advanceOfferRotation() for each
```

### Dispatcher Auto-Assignment

File: `src/lib/dispatcher/engine.ts` → `runDispatcher()` → calls `autoAssignWalkins()`

`autoAssignWalkins()` (file: `src/lib/walkin/queue_assignment.ts`):
1. Load barbers with `barber_status.status = 'AVAILABLE'`
2. For each: check no active CALLED/IN_SERVICE walkin already assigned
3. Priority 1: PREFERRED walkins wanting this barber (lowest position first)
4. Priority 2: ANY/FASTEST walkins (lowest position first)
5. Optimistic lock: `UPDATE walkins SET status='CALLED' WHERE id=X AND status='WAITING'`
6. Create `assignments` record
7. Append `WALKIN_AUTO_ASSIGNED` event
8. After assignments: compact queue positions (renumber 1,2,3…)

Note: `autoAssignWalkins` sets status=CALLED and `assigned_barber_id` directly — no SMS. SMS is only from `initiateWalkinOffer` triggered at walk-in creation. Both paths use optimistic locking on `status='WAITING'` to prevent double-assignment.

### Walk-In Status Machine

```
WAITING
  ├─(SMS: YES or auto-assign)──► CALLED (assigned_barber_id set, called_at set)
  │                                ├─(barber marks in-service)──► IN_SERVICE
  │                                │                                └─(barber done or auto-complete)──► DONE
  │                                ├─(5-min timeout in CALLED)──► NO_SHOW
  │                                └─(admin removes)──► REMOVED
  └─(admin removes)──► REMOVED
```

Auto-complete triggers in dispatcher:
- Barber transitions to `BUSY` in Acuity (calendar signal) while they have an `IN_SERVICE` walkin → mark DONE
- Fallback: `IN_SERVICE` for > 45 minutes (`MAX_SERVICE_MINUTES`) → mark DONE

### Queue Compaction

After any departure from WAITING: `compactQueuePositions()` renumbers all WAITING rows to 1, 2, 3… Only updates rows that actually moved. Fire-and-forget (non-blocking).

---

## Scheduling / Availability Engine

### Dispatcher Cycle

File: `src/lib/dispatcher/engine.ts` → `runDispatcher(admin, shopId, provider)`

1. Load active barbers with `acuity_calendar_id`
2. Load previous `barber_status` rows (for transition detection)
3. For each barber: `provider.getBusyWindows()` + `provider.getBlockedWindows()` in parallel
4. `computeBarberStatus()` — pure function, no DB
5. Upsert `barber_status`
6. Detect BUSY transitions → auto-complete any `IN_SERVICE` walkins
7. Enforce CALLED timeout (5 min → NO_SHOW)
8. Call `autoAssignWalkins()`

### `computeBarberStatus()` — Pure Function

```typescript
Input: barberId, BusyWindow[], BlockedWindow[], now: Date
Output: { status: EngineState, status_detail, free_at, next_appointment }

Priority order:
1. OFF_TODAY     — any block ≥ 8 hours covering now
2. BLOCKED       — current time inside any block window
3. BUSY          — inside an appointment, OR within PREP_BUFFER_MIN (5) of last appointment end
4. SOON_BOOKED   — next appointment starts within SOON_BOOKED_WINDOW_MIN (30) minutes
5. AVAILABLE     — none of the above
```

Constants (all in `engine.ts`):
- `PREP_BUFFER_MIN = 5`
- `SOON_BOOKED_WINDOW_MIN = 30`
- `CALLED_TIMEOUT_MINUTES = 5`
- `MAX_SERVICE_MINUTES = 45`

### Walk-In Eligibility

File: `src/lib/walkin/eligible_barbers.ts` → `getEligibleWalkinBarbers(supabase, shopId, now)`

Checks in order (first failure = rejected):
1. `users.walkin_enabled = true` — appointment-only barbers fail here (Tyrik, Will seeded false)
2. `barber_status.status = 'UNAVAILABLE'` → reject
3. `barber_status.status = 'FREE'` → **Acuity override: skip all further provider checks**, readyMinutes=0
4. `barber_status.status = 'BUSY'` → eligible but busy; readyMinutes = free_at - now
5. `calendar_connections.off_until_at` > now → reject (long-term absence)
6. Active `provider_blocks` (overlapping now) → reject
7. Active `provider_appointments` (overlapping now) → eligible but busy; readyMinutes = end_at - now
8. No `barber_status` row at all → fall back to `business_hours` schedule check
9. Upcoming appointment within `WALKIN_ELIGIBILITY_BUFFER_MINUTES (15)` → reject

Returns: `{ eligible: EligibleWalkinBarber[], rejected: RejectedWalkinBarber[] }`
`EligibleWalkinBarber.readyMinutes`: 0 = free now, >0 = busy but will be free

### Wait Time Formula

File: `src/lib/walkin/wait_time_estimator.ts`

```
AVG_WALKIN_MINUTES = 30

base_ready_minutes = min(readyMinutes) across all eligible barbers (0 if any are free now)

wait(position) = base_ready_minutes + position * AVG_WALKIN_MINUTES
  where position is 0-indexed in WAITING queue
```

### CalendarProvider Interface

File: `src/types/calendar-provider.ts` (re-exported from `src/lib/calendar/provider.ts`)

```typescript
interface CalendarProvider {
  getBusyWindows(barberId, calendarId, from, to): Promise<BusyWindow[]>
  getBlockedWindows(barberId, calendarId, from, to): Promise<BlockedWindow[]>
  getCalendars?(): Promise<CalendarInfo[]>  // optional
}
```

Acuity implementation: `src/lib/calendar/acuity-provider.ts`  
Raw API client: `src/lib/calendar/acuity-client.ts`

To add a new provider: implement `CalendarProvider`, pass instance to `runDispatcher()`.

---

## Current Architecture

### State Layer Summary

Three distinct state layers — they do NOT auto-reconcile:

| Layer | Table | Who writes it | Used for |
|---|---|---|---|
| Manual shift state | `barber_state` | Barber via dashboard | SMS rotation order (`state_since`), UI display |
| Calendar state | `barber_status` | Dispatcher (Acuity) | Eligibility, auto-assign, `free_at` for TV |
| Queue state | `walkins` | Kiosk RPC + dispatcher + barber | The actual queue |

### Key File Map

```
src/lib/
  dispatcher/
    engine.ts              ← runDispatcher(), computeBarberStatus() — CORE
  walkin/
    queue_assignment.ts    ← autoAssignWalkins(), findNextWalkinForBarber()
    eligible_barbers.ts    ← getEligibleWalkinBarbers() — eligibility gate
    walkin_offer.ts        ← SMS rotation: initiate, accept, decline, timeout
    shop_projector.ts      ← refreshShopProjection() — JSONB snapshot builder
    wait_time_estimator.ts ← estimateQueue(), AVG_WALKIN_MINUTES=30
    availability.ts        ← getShopAvailability(), getBarberHoursForDay()
    events.ts              ← appendEvent() — all audit log writes
    validation.ts          ← validateWalkinTransition()
    helpers.ts             ← getNextQueuePosition()
  calendar/
    provider.ts            ← re-exports CalendarProvider interface
    acuity-client.ts       ← raw Acuity REST API wrapper
    acuity-provider.ts     ← CalendarProvider impl for Acuity
  kiosk/
    actions.ts             ← submitWalkin() server action (calls join_walkin_queue RPC)
    helpers.ts             ← sanitizePhone()
    types.ts
  sms/
    twilio.ts              ← sendSms(), OFFER_MESSAGE, toE164()
  supabase/
    admin.ts               ← createAdminClient() — service role (bypasses RLS)
    client.ts              ← createClient() — anon/auth
    server.ts              ← server-side SSR client
    middleware.ts          ← updateSession() for auth
  queue/
    deriveDisplayStatus.ts ← EngineState → TV display label mapping
  owner/                   ← owner-facing helpers
  photo/                   ← barber photo + focus point
  shop-resolver.ts         ← slug → shop_id lookup

src/app/api/
  dispatcher/route.ts      ← POST handler for runDispatcher()
  walkins/route.ts         ← POST creates walkin + fires initiateWalkinOffer
  sms-response/route.ts    ← Twilio webhook: YES/NO handling
  webhooks/acuity/route.ts ← Acuity webhook receiver
  jobs/
    walkin-timeouts/route.ts  ← processExpiredAttempts()
    reconcile-acuity/route.ts ← full Acuity pull + drift repair

supabase/migrations/
  00006_join_walkin_queue.sql  ← atomic RPC with advisory lock
  00003_walkin_truth_layer.sql ← walkins, barber_state, assignments, events
  00005_walkin_kiosk_layer.sql ← clients, barber_status, views + walkins cols
  00010_calendar_ingest.sql    ← calendar_connections, provider_*, webhook_events
  00017_walkin_sms.sql         ← walkin_assignment_attempts, walkin_enabled
```

### Supabase Client Usage

- `createClient()` — anon/auth client, subject to RLS. Use in routes that have an authenticated user.
- `createAdminClient()` — service role, bypasses RLS. Use for: SMS offer rotation, kiosk RPC, dispatcher, any operation needing cross-RLS access.
- Never expose service role key client-side.

---

## Current Weak Points

### Critical — Fix Before Shipping to More Shops

**1. TypeScript types are stale (`src/types/database.ts`)**
Most tables type as `never` for insert/update params. Codebase uses `as unknown as Type` and `// @ts-expect-error` throughout. TypeScript is not catching real bugs. Fix: `npx supabase gen types typescript --project-id <id> > src/types/database.ts`.

**2. No Acuity webhook signature verification**
`POST /api/webhooks/acuity` accepts any payload. `// TODO` comment in the file. Fix: verify `X-Acuity-Signature` HMAC-SHA256 using `ACUITY_WEBHOOK_SECRET` env var.

**3. Dispatcher and walkin-timeouts are not in vercel.json**
Only `reconcile-acuity` is in the cron. `/api/dispatcher` and `/api/jobs/walkin-timeouts` must be called by an external scheduler. If they're not running, walk-ins won't be auto-assigned and SMS offers won't time out. Verify external scheduler is active or add to `vercel.json`.

**4. Hardcoded `SHOP_ID`**
`'00000000-0000-0000-0000-000000000001'` appears in `dispatcher/route.ts`, `kiosk/actions.ts`, and possibly others. Multi-shop routing exists in URL structure but shop injection isn't wired through middleware.

### High — Known Logic Issues

**5. `barber_state` and `barber_status` can diverge without reconciliation**
A barber can be manually AVAILABLE in `barber_state` while Acuity says BUSY in `barber_status`. Eligibility checks read both but there's no defined winner when they conflict outside the specific checks in `eligible_barbers.ts`.

**6. Migration naming collision**
`00006_join_walkin_queue.sql` and `00006_tv_tables.sql` share the same prefix. Depending on the migration runner, this can cause ordering issues or silent skip. One should be renumbered.

**7. Twilio signature validation is optional**
`TWILIO_VALIDATE_WEBHOOKS` env var controls validation. Not enforced in production by default. Anyone who knows the `/api/sms-response` URL can spoof barber YES/NO responses.

### Medium — Architecture Friction

**8. Two appointment tables with unclear precedence**
`appointments` (native, from 00001) and `provider_appointments` (Acuity-synced, from 00010). The `queue_assignment.ts` conflict check reads from `appointments`, not `provider_appointments`. If bookings live in Acuity only, the conflict check may miss them.

**9. SMS is the only barber notification path**
No in-app push or browser notification fallback. 90s offer window via SMS fails silently if a barber isn't watching their phone.

**10. Queue compaction is write-heavy under load**
Full renumber of all WAITING positions on every departure. Under concurrent operations, this can cause lock contention. Safe for single shop, potentially slow under high volume.

**11. `shop_state_projection` staleness is undetected**
`refreshShopProjection()` is called fire-and-forget. If it fails, the projection goes stale with no error surfaced to the frontend.

### Low

**12. Test coverage gaps**
Tests exist for: dispatcher engine, kiosk actions, hours validation, photo focus point, TV display labels. Not tested: SMS rotation, auto-assign orchestration, Acuity webhook ingestion — the three most failure-prone paths.

**13. `time_blocks` table may be orphaned**
Pre-Acuity manual unavailability table. May not be used now that `provider_blocks` exists.

---

## Current Priorities

### Fix First
1. Regenerate `src/types/database.ts` from Supabase CLI → eliminate `as unknown as` casts
2. Verify dispatcher + walkin-timeouts external scheduler is running (or add to vercel.json)
3. Add Acuity webhook HMAC verification
4. Resolve migration `00006` naming collision

### Stabilize Next
5. Clarify `appointments` vs `provider_appointments` conflict check in `queue_assignment.ts`
6. Add tests for SMS rotation (`walkin_offer.ts`) and auto-assign (`queue_assignment.ts`)
7. Enable Twilio webhook signature validation in production

### Build Next (Product Value)
8. Customer queue status page — phone-keyed, QR-accessible, shows position + wait
9. Customer-facing booking flow — barber → slot → confirm (decide: native or Acuity redirect)
10. Push notification fallback for barbers alongside SMS

### Defer
- Additional calendar providers (Booksy, Square) — abstraction is ready; no customers need it yet
- Stripe payments — no foundation built
- Multi-shop SaaS billing/onboarding — build when shop #2 is confirmed
- Analytics dashboard

---

## Quick Reference: Common Coding Tasks

**Add a column to walkins:**
→ New migration file (00020+), ALTER TABLE walkins ADD COLUMN, regenerate types

**Change eligibility rules:**
→ `src/lib/walkin/eligible_barbers.ts` → `getEligibleWalkinBarbers()`

**Change wait time calculation:**
→ `src/lib/walkin/wait_time_estimator.ts` → `AVG_WALKIN_MINUTES`, `computeBaseReadyMinutes()`

**Change how barber status is computed from Acuity:**
→ `src/lib/dispatcher/engine.ts` → `computeBarberStatus()`

**Change SMS offer behavior (timing, message, rotation):**
→ `src/lib/walkin/walkin_offer.ts` → `WALKIN_OFFER_TIMEOUT_SECONDS`, `initiateWalkinOffer()`

**Add a new calendar provider:**
→ Implement `CalendarProvider` interface from `src/types/calendar-provider.ts`
→ Pass instance to `runDispatcher()` in `src/app/api/dispatcher/route.ts`

**Change TV display labels:**
→ `src/lib/queue/deriveDisplayStatus.ts`

**Change shop snapshot contents:**
→ `src/lib/walkin/shop_projector.ts` → `ShopSnapshot` type + `refreshShopProjection()`

**Debug "no barbers eligible" for a walk-in:**
→ Check server logs for `[WALKIN_CREATED ...]` tag — eligibility snapshot is logged on every POST /api/walkins
→ Or call `getEligibleWalkinBarbers()` directly with the shop ID

**Read queue state safely from client:**
→ Use `public_walkins` and `public_barbers` views (anon-safe, no PII)
→ Or read `shop_state_projection.snapshot` for the full denormalized snapshot
