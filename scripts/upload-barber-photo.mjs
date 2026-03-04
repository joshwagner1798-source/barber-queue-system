// One-off script: create barber-photos bucket and upload Josh Wagner's photo
import { createClient } from '@supabase/supabase-js'
import { readFileSync } from 'fs'
import { readFile } from 'fs/promises'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!url || !key) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY')
  process.exit(1)
}

const admin = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false },
})

// 1. Check / create bucket
const { data: buckets, error: bErr } = await admin.storage.listBuckets()
if (bErr) { console.error('listBuckets:', bErr.message); process.exit(1) }

const exists = buckets?.some((b) => b.name === 'barber-photos')
if (!exists) {
  const { error } = await admin.storage.createBucket('barber-photos', { public: true })
  if (error) { console.error('createBucket:', error.message); process.exit(1) }
  console.log('Created bucket: barber-photos (public)')
} else {
  console.log('Bucket barber-photos already exists')
}

// 2. Upload photo
const photoPath = '/Users/xvjosh/Downloads/IMG_9083-removebg-preview.png'
const file = await readFile(photoPath)
const { data: up, error: upErr } = await admin.storage
  .from('barber-photos')
  .upload('josh-wagner.png', file, { contentType: 'image/png', upsert: true })
if (upErr) { console.error('upload:', upErr.message); process.exit(1) }
console.log('Uploaded:', up.path)

// 3. Public URL
const { data: urlData } = admin.storage.from('barber-photos').getPublicUrl('josh-wagner.png')
const publicUrl = urlData.publicUrl
console.log('Public URL:', publicUrl)

// 4. Find Josh Wagner
const { data: barbers, error: barsErr } = await admin
  .from('users')
  .select('id, first_name, last_name, avatar_url')
  .eq('role', 'barber')
if (barsErr) { console.error('listBarbers:', barsErr.message); process.exit(1) }
console.log('Barbers in DB:', barbers?.map((b) => `${b.first_name} ${b.last_name}`))

const josh = barbers?.find(
  (b) =>
    b.first_name?.toLowerCase() === 'josh' &&
    b.last_name?.toLowerCase() === 'wagner',
)
if (!josh) {
  console.log('Josh Wagner not found — avatar_url not updated')
  process.exit(0)
}

// 5. Update avatar_url
const { error: updErr } = await admin
  .from('users')
  .update({ avatar_url: publicUrl })
  .eq('id', josh.id)
if (updErr) { console.error('update:', updErr.message); process.exit(1) }
console.log(`Updated Josh Wagner (${josh.id}) avatar_url = ${publicUrl}`)
