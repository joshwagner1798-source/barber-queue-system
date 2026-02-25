import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY

console.log('USING_URL', url)
console.log('KEY_PREFIX', (key ?? '').slice(0, 15))

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const { data, error } = await supabase.auth.admin.listUsers()
if (error) {
  console.error('LIST_ERROR', error)
  process.exit(1)
}

console.log('LOCAL_USER_COUNT', data.users.length)
console.log(
  data.users.slice(0, 25).map(u => ({
    id: u.id,
    email: u.email,
    confirmed: !!u.email_confirmed_at,
    created_at: u.created_at,
  }))
)
