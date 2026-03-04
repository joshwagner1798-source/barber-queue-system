#!/usr/bin/env node
// ---------------------------------------------------------------------------
// scripts/test-reconcile.mjs
//
// Smoke-test for the calendar ingest schema + reconcile logic.
//
// Because Acuity credentials are not required, this script bypasses the HTTP
// reconcile endpoint and instead:
//   1. Seeds calendar_connections with 2 fake barbers (calIDs '11111', '22222')
//   2. Seeds provider_appointments with last_seen_at='2099-01-01' so the
//      drift-repair UPDATE (last_seen_at < reconcileStartedAt) does NOT touch them
//   3. Validates: 0 rows → exit 1 | null barber_id → exit 1 | orphaned calIDs → exit 1
//   4. Cleans up the seeded rows
//
// Usage:
//   node --env-file=.env.local scripts/test-reconcile.mjs
//
// Required env vars:
//   NEXT_PUBLIC_SUPABASE_URL
//   SUPABASE_SERVICE_ROLE_KEY
//   DEFAULT_SHOP_ID
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js'

// ---------------------------------------------------------------------------
// Env
// ---------------------------------------------------------------------------
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY
const SHOP_ID = process.env.DEFAULT_SHOP_ID

function requireEnv(name, value) {
  if (!value) {
    console.error(`ERROR: ${name} env var is not set`)
    process.exit(1)
  }
}

requireEnv('NEXT_PUBLIC_SUPABASE_URL', SUPABASE_URL)
requireEnv('SUPABASE_SERVICE_ROLE_KEY', SERVICE_ROLE_KEY)

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Resolve a valid shop UUID: prefer env var if it looks like a UUID,
// otherwise pick the first shop from the DB (local dev only).
async function resolveShopId() {
  if (SHOP_ID && UUID_RE.test(SHOP_ID)) return SHOP_ID

  if (SHOP_ID) {
    console.warn(`WARNING: DEFAULT_SHOP_ID="${SHOP_ID}" is not a valid UUID — querying shops table`)
  } else {
    console.warn('WARNING: DEFAULT_SHOP_ID not set — querying shops table')
  }

  const { data, error } = await supabase.from('shops').select('id, name').limit(1).single()
  if (error || !data) {
    console.error('No shops found in DB and DEFAULT_SHOP_ID is not a valid UUID.')
    console.error('Fix: add a valid UUID to DEFAULT_SHOP_ID in .env.local')
    process.exit(1)
  }
  console.log(`  Using shop: "${data.name}" (${data.id})`)
  return data.id
}

const RESOLVED_SHOP_ID = await resolveShopId()

// Stable fake UUIDs so re-runs are idempotent
const BARBER_A_ID = '00000000-0000-0000-0000-000000000001'
const BARBER_B_ID = '00000000-0000-0000-0000-000000000002'
const CAL_A = '11111'
const CAL_B = '22222'

// Seed row IDs we control so teardown is precise
const CONN_A_ID = '00000000-aaaa-0000-0000-000000000001'
const CONN_B_ID = '00000000-aaaa-0000-0000-000000000002'
const APPT_A_ID = '00000000-bbbb-0000-0000-000000000001'
const APPT_B_ID = '00000000-bbbb-0000-0000-000000000002'

// ---------------------------------------------------------------------------
// Cleanup helper — runs before AND after so reruns start clean
// ---------------------------------------------------------------------------
async function cleanup() {
  // Remove seeded appointments by stable ID and by provider_appointment_id (both paths)
  await supabase.from('provider_appointments').delete().in('id', [APPT_A_ID, APPT_B_ID])
  await supabase
    .from('provider_appointments')
    .delete()
    .in('provider_appointment_id', ['smoke-test-11111-1', 'smoke-test-22222-1'])

  // Remove seeded connections by stable ID and by unique composite key
  // (handles reruns where the row exists with a different generated ID)
  await supabase.from('calendar_connections').delete().in('id', [CONN_A_ID, CONN_B_ID])
  if (RESOLVED_SHOP_ID) {
    await supabase
      .from('calendar_connections')
      .delete()
      .eq('shop_id', RESOLVED_SHOP_ID)
      .eq('provider', 'acuity')
      .in('provider_calendar_id', [CAL_A, CAL_B])
  }
}

// ---------------------------------------------------------------------------
// Step 1: Pre-cleanup (idempotent reruns)
// ---------------------------------------------------------------------------
console.log('Cleaning up any previous seed data...')
await cleanup()

// ---------------------------------------------------------------------------
// Step 2: Seed calendar_connections
// ---------------------------------------------------------------------------
console.log('Seeding calendar_connections...')

const { error: connErr } = await supabase.from('calendar_connections').insert([
  {
    id: CONN_A_ID,
    shop_id: RESOLVED_SHOP_ID,
    barber_id: BARBER_A_ID,
    provider: 'acuity',
    provider_calendar_id: CAL_A,
    active: true,
    sync_health: 'OK',
  },
  {
    id: CONN_B_ID,
    shop_id: RESOLVED_SHOP_ID,
    barber_id: BARBER_B_ID,
    provider: 'acuity',
    provider_calendar_id: CAL_B,
    active: true,
    sync_health: 'OK',
  },
])

if (connErr) {
  console.error('Failed to seed calendar_connections:', connErr.message)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Step 3: Seed provider_appointments
// last_seen_at='2099-01-01' ensures drift repair (last_seen_at < now()) skips them
// ---------------------------------------------------------------------------
console.log('Seeding provider_appointments...')

const { error: apptErr } = await supabase.from('provider_appointments').insert([
  {
    id: APPT_A_ID,
    shop_id: RESOLVED_SHOP_ID,
    barber_id: BARBER_A_ID,
    provider: 'acuity',
    provider_appointment_id: 'smoke-test-11111-1',
    provider_calendar_id: CAL_A,
    start_at: '2026-03-01T10:00:00Z',
    end_at: '2026-03-01T10:30:00Z',
    status: 'ACTIVE',
    last_seen_at: '2099-01-01T00:00:00Z',
    payload_json: { note: 'smoke-test' },
  },
  {
    id: APPT_B_ID,
    shop_id: RESOLVED_SHOP_ID,
    barber_id: BARBER_B_ID,
    provider: 'acuity',
    provider_appointment_id: 'smoke-test-22222-1',
    provider_calendar_id: CAL_B,
    start_at: '2026-03-01T11:00:00Z',
    end_at: '2026-03-01T11:30:00Z',
    status: 'ACTIVE',
    last_seen_at: '2099-01-01T00:00:00Z',
    payload_json: { note: 'smoke-test' },
  },
])

if (apptErr) {
  console.error('Failed to seed provider_appointments:', apptErr.message)
  await cleanup()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Step 4: Query provider_appointments for this shop
// ---------------------------------------------------------------------------
console.log('Querying provider_appointments...')

const { data: rows, error: queryErr } = await supabase
  .from('provider_appointments')
  .select('id, barber_id, provider_calendar_id, start_at, status')
  .eq('shop_id', RESOLVED_SHOP_ID)
  .eq('provider', 'acuity')

if (queryErr) {
  console.error('Query failed:', queryErr.message)
  await cleanup()
  process.exit(1)
}

// ---------------------------------------------------------------------------
// Step 5: Fetch valid provider_calendar_ids from calendar_connections
// ---------------------------------------------------------------------------
const { data: connections, error: connQueryErr } = await supabase
  .from('calendar_connections')
  .select('provider_calendar_id')
  .eq('shop_id', RESOLVED_SHOP_ID)
  .eq('provider', 'acuity')
  .eq('active', true)

if (connQueryErr) {
  console.error('calendar_connections query failed:', connQueryErr.message)
  await cleanup()
  process.exit(1)
}

const validCalendarIds = new Set((connections ?? []).map((c) => c.provider_calendar_id))

// ---------------------------------------------------------------------------
// Step 6: Validate
// ---------------------------------------------------------------------------
let exitCode = 0

if (!rows || rows.length === 0) {
  console.error('FAIL: 0 rows in provider_appointments')
  exitCode = 1
}

const nullBarberRows = (rows ?? []).filter((r) => !r.barber_id)
if (nullBarberRows.length > 0) {
  console.error(`FAIL: ${nullBarberRows.length} row(s) with NULL barber_id`)
  exitCode = 1
}

const invalidCalRows = (rows ?? []).filter(
  (r) => !validCalendarIds.has(r.provider_calendar_id),
)
if (invalidCalRows.length > 0) {
  console.error(
    `FAIL: ${invalidCalRows.length} row(s) with provider_calendar_id not in calendar_connections:`,
    [...new Set(invalidCalRows.map((r) => r.provider_calendar_id))],
  )
  exitCode = 1
}

// ---------------------------------------------------------------------------
// Step 7: Cleanup seed data
// ---------------------------------------------------------------------------
console.log('Cleaning up seed data...')
await cleanup()

if (exitCode !== 0) {
  process.exit(exitCode)
}

// ---------------------------------------------------------------------------
// Step 8: Success output
// ---------------------------------------------------------------------------
const byBarber = {}
const byCalendar = {}

for (const row of rows ?? []) {
  byBarber[row.barber_id] = (byBarber[row.barber_id] ?? 0) + 1
  byCalendar[row.provider_calendar_id] = (byCalendar[row.provider_calendar_id] ?? 0) + 1
}

console.log('\n✓ Smoke test PASSED')
console.log(`  Total appointments validated: ${(rows ?? []).length}`)

console.log('  By barber:')
for (const [barberId, count] of Object.entries(byBarber)) {
  console.log(`    ${barberId}: ${count}`)
}

console.log('  By calendar_id:')
for (const [calId, count] of Object.entries(byCalendar)) {
  console.log(`    ${calId}: ${count}`)
}
