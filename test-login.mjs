import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

const email = 'joshwagner1798@gmail.com'
const password = 'CHANGE_ME_NOW_UseSomethingYouCanType' // must match set-password.mjs

const supabase = createClient(url, anon)

const { data, error } = await supabase.auth.signInWithPassword({ email, password })

if (error) {
  console.error('LOGIN_ERROR', error)
  process.exit(1)
}

console.log('LOGIN_OK', data.user.email, 'SESSION?', !!data.session)
