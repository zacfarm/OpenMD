import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import { ensureSupabaseConfig } from './supabaseConfig'

export async function createSupabaseServerClient() {
  const cookieStore = await cookies()
  const config = ensureSupabaseConfig()

  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
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
}
