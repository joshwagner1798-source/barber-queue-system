#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// scripts/clear-active-queue.ts
//
// Deletes all WAITING, CALLED, and IN_SERVICE walk-ins for the shop.
// Related assignments and walkin_assignment_attempts cascade automatically.
//
// Usage:
//   npx tsx scripts/clear-active-queue.ts
//
// Dry-run (shows what would be deleted, no changes made):
//   DRY_RUN=true npx tsx scripts/clear-active-queue.ts
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { resolve } from 'path'

function loadEnv() {
  try {
    const raw = readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8')
    for (const line of raw.split('\n')) {
      const trimmed = line.trim()
      if (!trimmed || trimmed.startsWith('#')) continue
      const eq = trimmed.indexOf('=')
      if (eq === -1) continue
      const key = trimmed.slice(0, eq).trim()
      const val = trimmed.slice(eq + 1).trim().replace(/^['"]|['"]$/g, '')
      if (!process.env[key]) process.env[key] = val
    }
  } catch {
    console.error('Could not load .env.local — make sure it exists at the project root.')
    process.exit(1)
  }
}

loadEnv()

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!
const SHOP_ID      = process.env.DEFAULT_SHOP_ID!
const DRY_RUN      = process.env.DRY_RUN === 'true'

const ACTIVE_STATUSES = ['WAITING', 'CALLED', 'IN_SERVICE'] as const

async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!SHOP_ID) {
    console.error('Missing DEFAULT_SHOP_ID')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Preview what will be deleted
  const { data, error: fetchErr } = await supabase
    .from('walkins')
    .select('id, status, service_type, position, created_at')
    .eq('shop_id', SHOP_ID)
    .in('status', ACTIVE_STATUSES)
    .order('position', { ascending: true })

  if (fetchErr) {
    console.error('DB error:', fetchErr.message)
    process.exit(1)
  }

  type Row = { id: string; status: string; service_type: string; position: number; created_at: string }
  const rows = (data ?? []) as unknown as Row[]

  if (rows.length === 0) {
    console.log('Queue is already empty — nothing to delete.')
    return
  }

  console.log(`\nActive walk-ins to delete (${rows.length} total):`)
  console.log('─'.repeat(60))
  for (const r of rows) {
    const time = new Date(r.created_at).toLocaleTimeString()
    console.log(`  [${r.status.padEnd(10)}] pos ${String(r.position).padStart(2)}  ${r.service_type.padEnd(20)} joined ${time}`)
  }
  console.log('─'.repeat(60))

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No records deleted. Remove DRY_RUN=true to delete for real.\n')
    return
  }

  const { error: deleteErr } = await supabase
    .from('walkins')
    .delete()
    .eq('shop_id', SHOP_ID)
    .in('status', ACTIVE_STATUSES)

  if (deleteErr) {
    console.error('Delete failed:', deleteErr.message)
    process.exit(1)
  }

  console.log(`\nDeleted ${rows.length} walk-in(s). Queue is now empty.\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
