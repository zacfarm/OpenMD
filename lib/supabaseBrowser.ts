import { createBrowserClient } from '@supabase/ssr'

import { ensureSupabaseConfig } from './supabaseConfig'

export function createSupabaseBrowserClient() {
  const config = ensureSupabaseConfig()

  return createBrowserClient(config.supabaseUrl, config.supabaseAnonKey)
}
