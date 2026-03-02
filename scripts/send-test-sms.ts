#!/usr/bin/env npx tsx
// ---------------------------------------------------------------------------
// scripts/send-test-sms.ts
//
// Sends the walk-in offer example SMS to every active barber who has a phone
// number. Reads from your .env.local and the Supabase DB.
//
// Usage:
//   npx tsx scripts/send-test-sms.ts
//
// Dry-run (prints what WOULD be sent, no actual SMS):
//   DRY_RUN=true npx tsx scripts/send-test-sms.ts
// ---------------------------------------------------------------------------

import { createClient } from '@supabase/supabase-js'
import twilio from 'twilio'
import { readFileSync } from 'fs'
import { resolve } from 'path'

// ---------------------------------------------------------------------------
// Load .env.local manually (tsx doesn't auto-load it)
// ---------------------------------------------------------------------------
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

// ---------------------------------------------------------------------------
// Config
// ---------------------------------------------------------------------------
const SUPABASE_URL       = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SUPABASE_KEY       = process.env.SUPABASE_SERVICE_ROLE_KEY!
const TWILIO_SID         = process.env.TWILIO_ACCOUNT_SID!
const TWILIO_TOKEN       = process.env.TWILIO_AUTH_TOKEN!
const TWILIO_FROM        = process.env.TWILIO_PHONE_NUMBER!
const DRY_RUN            = process.env.DRY_RUN === 'true'

const MESSAGE = `[TEST] New walk-in ready! Reply YES to accept or NO to skip. Offer expires in 90 seconds.`

// ---------------------------------------------------------------------------
// Phone normalisation
// ---------------------------------------------------------------------------
function toE164(phone: string): string {
  if (phone.startsWith('+')) return phone
  const digits = phone.replace(/\D/g, '')
  if (digits.length === 10) return `+1${digits}`
  if (digits.length === 11 && digits[0] === '1') return `+${digits}`
  return phone
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------
async function main() {
  if (!SUPABASE_URL || !SUPABASE_KEY) {
    console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
    process.exit(1)
  }
  if (!DRY_RUN && (!TWILIO_SID || !TWILIO_TOKEN || !TWILIO_FROM)) {
    console.error('Missing TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, or TWILIO_PHONE_NUMBER')
    process.exit(1)
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_KEY)

  // Fetch all active barbers with a phone number
  const { data, error } = await supabase
    .from('users')
    .select('id, first_name, last_name, phone, walkin_enabled')
    .eq('role', 'barber')
    .eq('is_active', true)
    .not('phone', 'is', null)
    .order('display_order', { ascending: true })

  if (error) {
    console.error('DB error:', error.message)
    process.exit(1)
  }

  type Row = { id: string; first_name: string; last_name: string; phone: string; walkin_enabled: boolean }
  const barbers = (data ?? []) as unknown as Row[]

  if (!barbers.length) {
    console.log('No active barbers with phone numbers found.')
    return
  }

  console.log(`\n📋 Barbers to receive test SMS (${barbers.length} total):`)
  console.log('─'.repeat(52))
  for (const b of barbers) {
    const flag = b.walkin_enabled ? '✅ walkin' : '📅 appt-only'
    console.log(`  ${b.first_name} ${b.last_name.padEnd(12)} ${b.phone.padEnd(14)} ${flag}`)
  }

  console.log('\n📨 Message preview:')
  console.log('─'.repeat(52))
  console.log(`  "${MESSAGE}"`)
  console.log('─'.repeat(52))

  if (DRY_RUN) {
    console.log('\n[DRY RUN] No messages sent. Remove DRY_RUN=true to send for real.\n')
    return
  }

  const client = twilio(TWILIO_SID, TWILIO_TOKEN)
  let sent = 0
  let failed = 0

  console.log('\n🚀 Sending...\n')

  for (const b of barbers) {
    const to = toE164(b.phone)
    try {
      const msg = await client.messages.create({ body: MESSAGE, from: TWILIO_FROM, to })
      console.log(`  ✅ ${b.first_name} ${b.last_name} → ${to}  (SID: ${msg.sid})`)
      sent++
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      console.log(`  ❌ ${b.first_name} ${b.last_name} → ${to}  ERROR: ${msg}`)
      failed++
    }
  }

  console.log(`\n✔ Done — ${sent} sent, ${failed} failed.\n`)
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
