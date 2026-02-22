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

// Confirmed correct mapping: file → barber first+last name (exact match)
const UPLOADS = [
  { file: '09BF856C-B43A-451F-B227-C0B862DC7EB4.PNG', firstName: 'Joseph',  lastName: 'Joseph',  slug: 'joseph.png',      mime: 'image/png'  },
  { file: 'BC1B8A6C-E70C-4648-8A35-D1D29F9148A1.PNG', firstName: 'Wil',     lastName: 'Winder',  slug: 'wil.png',         mime: 'image/png'  },
  { file: 'C2055F3A-2523-4276-993C-726F2810156D.PNG', firstName: 'Elias',   lastName: 'Cosme',   slug: 'elias.png',       mime: 'image/png'  },
  { file: 'IMG_3158 2.jpg',                           firstName: 'Tyrik',   lastName: 'Jackson', slug: 'tyrik.jpg',       mime: 'image/jpeg' },
  { file: 'IMG_9083.PNG',                             firstName: 'Josh',    lastName: 'Wagner',  slug: 'josh-wagner.png', mime: 'image/png'  },
  { file: 'F3E3CE8C-E199-453F-A61B-AD5AFF1E2C1D.PNG', firstName: 'Izaiah', lastName: 'Albino',  slug: 'izaiah.png',      mime: 'image/png'  },
]

const { data: barbers, error: bErr } = await admin
  .from('users').select('id, first_name, last_name, avatar_url').eq('role', 'barber')
if (bErr) { console.error(bErr.message); process.exit(1) }

console.log('Current DB state:')
barbers.forEach(b => console.log(`  ${b.first_name} ${b.last_name} → ${b.avatar_url ?? '(none)'}`))
console.log()

for (const { file, firstName, lastName, slug, mime } of UPLOADS) {
  console.log(`--- ${firstName} ${lastName} ---`)

  // Match by exact first+last name
  const barber = barbers.find(
    b => b.first_name?.toLowerCase() === firstName.toLowerCase() &&
         b.last_name?.toLowerCase()  === lastName.toLowerCase()
  )
  if (!barber) { console.log(`  ERROR: barber not found in DB\n`); continue }
  console.log(`  ID: ${barber.id}`)

  const filePath = `/Users/xvjosh/Downloads/${file}`
  let data
  try { data = await readFile(filePath) }
  catch { console.log(`  ERROR: file not found: ${filePath}\n`); continue }
  console.log(`  File: ${file} (${(data.length / 1024).toFixed(0)} KB)`)

  // Upload (upsert)
  const { data: up, error: upErr } = await admin.storage
    .from('barber-photos').upload(slug, data, { contentType: mime, upsert: true })
  if (upErr) { console.error(`  ERROR upload: ${upErr.message}\n`); continue }
  console.log(`  Uploaded: ${up.path}`)

  const { data: urlData } = admin.storage.from('barber-photos').getPublicUrl(slug)
  const publicUrl = urlData.publicUrl

  // Verify URL is accessible
  const check = await fetch(publicUrl, { method: 'HEAD' })
  console.log(`  URL: ${publicUrl}`)
  console.log(`  HTTP: ${check.status} ${check.status === 200 ? '✓' : '✗ NOT ACCESSIBLE'}`)

  // Update avatar_url
  const { error: updErr } = await admin.from('users')
    .update({ avatar_url: publicUrl }).eq('id', barber.id)
  if (updErr) { console.error(`  ERROR update: ${updErr.message}\n`); continue }
  console.log(`  avatar_url updated ✓\n`)
}

console.log('Final DB state:')
const { data: final } = await admin.from('users').select('first_name, last_name, avatar_url').eq('role', 'barber')
final?.forEach(b => console.log(`  ${b.first_name} ${b.last_name} → ${b.avatar_url ?? '(none)'}`))
