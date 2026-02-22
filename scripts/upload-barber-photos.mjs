// Upload barber cutout photos to Supabase storage and update avatar_url
import { createClient } from '@supabase/supabase-js'
import { readFile } from 'fs/promises'
import { readFileSync } from 'fs'

// Load .env.local manually
const envFile = readFileSync(new URL('../.env.local', import.meta.url), 'utf8')
const env = Object.fromEntries(
  envFile.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const url = env.NEXT_PUBLIC_SUPABASE_URL
const key = env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// Map: filename in ~/Downloads → barber first name (lowercase) to match by
const UPLOADS = [
  { file: 'IMG_1166.PNG', firstName: 'joseph',  slug: 'joseph' },
  { file: 'IMG_1167.PNG', firstName: 'elias',   slug: 'elias'  },
  { file: 'IMG_1168.PNG', firstName: 'tyrik',   slug: 'tyrik'  },
  { file: 'IMG_1169.PNG', firstName: 'wil',     slug: 'wil'    },
  { file: 'F3E3CE8C-E199-453F-A61B-AD5AFF1E2C1D.PNG', firstName: 'izaiah', slug: 'izaiah' },
]

// Fetch all barbers
const { data: barbers, error: bErr } = await admin
  .from('users')
  .select('id, first_name, last_name, avatar_url')
  .eq('role', 'barber')
console.log('Barbers:', barbers?.map(b => `${b.first_name} ${b.last_name}`))
if (bErr) { console.error(bErr.message); process.exit(1) }

for (const { file, firstName, slug } of UPLOADS) {
  const filePath = `/Users/xvjosh/Downloads/${file}`
  console.log(`\n--- ${firstName} (${file}) ---`)

  // Find barber by first name
  const barber = barbers?.find(b => b.first_name?.toLowerCase() === firstName)
  if (!barber) {
    console.log(`  SKIP: no barber with first_name="${firstName}"`)
    continue
  }
  console.log(`  Found: ${barber.first_name} ${barber.last_name} (${barber.id})`)

  // Upload to storage
  let fileData
  try {
    fileData = await readFile(filePath)
  } catch {
    console.log(`  SKIP: file not found at ${filePath}`)
    continue
  }

  const storagePath = `${slug}.png`
  const { data: up, error: upErr } = await admin.storage
    .from('barber-photos')
    .upload(storagePath, fileData, { contentType: 'image/png', upsert: true })
  if (upErr) { console.error(`  upload error: ${upErr.message}`); continue }
  console.log(`  Uploaded: ${up.path}`)

  // Get public URL
  const { data: urlData } = admin.storage.from('barber-photos').getPublicUrl(storagePath)
  const publicUrl = urlData.publicUrl
  console.log(`  Public URL: ${publicUrl}`)

  // Update avatar_url
  const { error: updErr } = await admin
    .from('users')
    .update({ avatar_url: publicUrl })
    .eq('id', barber.id)
  if (updErr) { console.error(`  update error: ${updErr.message}`); continue }
  console.log(`  Updated avatar_url ✓`)
}

console.log('\nDone.')
