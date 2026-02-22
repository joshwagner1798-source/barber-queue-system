import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'

const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const admin = createClient(env.NEXT_PUBLIC_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
})

const ACTUAL_SHOP = 'a60f8d73-3d21-41be-b4bd-eec9fbc5d49b'
const OLD_SHOP   = '00000000-0000-0000-0000-000000000001'

console.log('=== barber_state ===')
const { data: bstate } = await admin.from('barber_state').select('barber_id, state, state_since').limit(10)
console.log(bstate)

console.log('\n=== barber_status ===')
const { data: bstatus } = await admin.from('barber_status').select('*').limit(10)
console.log(bstatus)

console.log('\n=== walkins (shop_id) ===')
const { data: walkins } = await admin.from('walkins').select('id, shop_id, status').limit(3)
console.log(walkins)

console.log('\n=== barbers with ACTUAL shop_id ===')
const { data: barbers } = await admin.from('users').select('id, first_name, last_name, avatar_url')
  .eq('role', 'barber').eq('is_active', true).eq('shop_id', ACTUAL_SHOP)
console.log(barbers?.map(b => `${b.first_name} ${b.last_name} | avatar=${b.avatar_url ? 'yes' : 'no'}`))
