import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'
import type { SupabaseClient } from '@supabase/supabase-js'

import { ensureSupabaseConfig } from './supabaseConfig'

export async function createSupabaseServerClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies()
  const config = ensureSupabaseConfig()

  if (!config) {
    throw new Error('Supabase configuration is missing')
  }

  const client = createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll()
      },
      setAll(cookiesToSet) {
        try {
          for (const { name, value, options } of cookiesToSet) {
            cookieStore.set({ name, value, ...(options ?? {}) })
          }
        } catch {
          // noop during server render
        }
      },
    },
  })

  return client
}
