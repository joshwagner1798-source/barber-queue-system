import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const env = Object.fromEntries(
  readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
    .split('\n').filter(l => l && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)
const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const now = new Date().toISOString()
console.log('now:', now)

// Real barber IDs
const REAL_BARBERS = [
  'e1f6f647-d57c-4b19-80ac-481a7625cda9', // Joseph
  '34943be8-a637-434e-81b5-5a837c9a026d', // Izaiah
  '4453429d-ca50-431d-b332-0099bb498597', // Josh
  'e03b096f-5f77-449e-8a7e-476933e29fe8', // Wil
  'b89523d0-5392-47a0-9bf5-16637caf3b3e', // Tyrik
  '2b269198-55f2-4810-9152-142d059d8a01', // Elias
]

const { data: future } = await admin
  .from('provider_appointments')
  .select('barber_id, shop_id, start_at, end_at, status')
  .in('barber_id', REAL_BARBERS)
  .gt('start_at', now)
  .neq('status', 'CANCELLED')
  .order('start_at')
  .limit(20)

console.log('\nFuture appointments for real barbers:')
if (!future?.length) {
  console.log('  NONE — all appointments are in the past')
} else {
  future.forEach(a => console.log(' ', a.barber_id.slice(0,8), a.shop_id, a.start_at, a.status))
}

// What's the latest appointment?
const { data: latest } = await admin
  .from('provider_appointments')
  .select('barber_id, start_at, status')
  .in('barber_id', REAL_BARBERS)
  .order('start_at', { ascending: false })
  .limit(3)
console.log('\nLatest appointments:', latest?.map(a => `${a.start_at} ${a.status}`))
