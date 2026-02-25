import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const key = process.env.SUPABASE_SERVICE_ROLE_KEY
const email = 'joshwagner1798@gmail.com'

// CHANGE THIS to the password you want to use:
const newPassword = 'CHANGE_ME_NOW_UseSomethingYouCanType'

const supabase = createClient(url, key, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const { data: list, error: listError } = await supabase.auth.admin.listUsers()
if (listError) throw listError

const user = list.users.find(u => u.email === email)
if (!user) {
  console.error('USER_NOT_FOUND', email)
  process.exit(1)
}

const { data, error } = await supabase.auth.admin.updateUserById(user.id, {
  password: newPassword
})

if (error) {
  console.error('UPDATE_ERROR', error)
  process.exit(1)
}

console.log('PASSWORD_UPDATED_FOR', data.user.email, 'ID', data.user.id)
