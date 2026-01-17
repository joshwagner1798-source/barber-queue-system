import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import type { Database } from '@/types/database'

// Admin client with service role - bypasses RLS
// Use only in server-side code for admin operations
export function createAdminClient() {
  return createSupabaseClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  )
}
