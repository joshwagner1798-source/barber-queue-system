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

// Sample rows to see all columns
const { data, error } = await admin
  .from('provider_appointments')
  .select('*')
  .limit(3)

if (error) { console.error(error); process.exit(1) }
if (!data?.length) {
  console.log('provider_appointments is empty — showing column names via RPC')
  // Try to get column info from information_schema
  const { data: cols } = await admin.rpc('get_table_columns', { table_name: 'provider_appointments' }).single()
  console.log(cols)
} else {
  console.log('Sample row keys:', Object.keys(data[0]))
  console.log('Sample rows:')
  data.forEach(r => console.log(JSON.stringify(r, null, 2)))
}
