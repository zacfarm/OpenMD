import { createClient } from '@supabase/supabase-js'

import { ensureSupabaseConfig } from './supabaseConfig'

let adminClient: ReturnType<typeof createClient> | null = null

export function createSupabaseAdminClient() {
  if (adminClient) {
    return adminClient
  }

  const config = ensureSupabaseConfig()
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY

  if (!serviceRoleKey) {
    throw new Error('SUPABASE_SERVICE_ROLE_KEY is not configured.')
  }

  adminClient = createClient(config.supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  })

  return adminClient
}
