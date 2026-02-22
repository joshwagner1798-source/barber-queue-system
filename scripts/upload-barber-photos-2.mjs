import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
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

const UPLOADS = [
  { file: '09BF856C-B43A-451F-B227-C0B862DC7EB4.PNG', firstName: 'joseph', slug: 'joseph', mime: 'image/png' },
  { file: 'BC1B8A6C-E70C-4648-8A35-D1D29F9148A1.PNG', firstName: 'wil',    slug: 'wil',    mime: 'image/png' },
  { file: 'C2055F3A-2523-4276-993C-726F2810156D.PNG', firstName: 'elias',  slug: 'elias',  mime: 'image/png' },
  { file: 'IMG_3158 2.jpg',                           firstName: 'tyrik',  slug: 'tyrik',  mime: 'image/jpeg' },
]

const { data: barbers, error: bErr } = await admin
  .from('users').select('id, first_name, last_name').eq('role', 'barber')
if (bErr) { console.error(bErr.message); process.exit(1) }
console.log('Barbers:', barbers.map(b => `${b.first_name} ${b.last_name}`))

for (const { file, firstName, slug, mime } of UPLOADS) {
  const filePath = `/Users/xvjosh/Downloads/${file}`
  console.log(`\n--- ${firstName} (${file}) ---`)

  const barber = barbers.find(b => b.first_name?.toLowerCase() === firstName)
  if (!barber) { console.log(`  SKIP: barber "${firstName}" not found`); continue }
  console.log(`  Barber: ${barber.first_name} ${barber.last_name} (${barber.id})`)

  let data
  try { data = await readFile(filePath) }
  catch { console.log(`  SKIP: file not found at ${filePath}`); continue }

  const ext = mime === 'image/jpeg' ? 'jpg' : 'png'
  const storagePath = `${slug}.${ext}`

  const { data: up, error: upErr } = await admin.storage
    .from('barber-photos')
    .upload(storagePath, data, { contentType: mime, upsert: true })
  if (upErr) { console.error(`  upload error: ${upErr.message}`); continue }
  console.log(`  Uploaded: ${up.path}`)

  const { data: urlData } = admin.storage.from('barber-photos').getPublicUrl(storagePath)
  console.log(`  URL: ${urlData.publicUrl}`)

  const { error: updErr } = await admin.from('users')
    .update({ avatar_url: urlData.publicUrl }).eq('id', barber.id)
  if (updErr) { console.error(`  update error: ${updErr.message}`); continue }
  console.log(`  avatar_url updated ✓`)
}

console.log('\nDone.')
