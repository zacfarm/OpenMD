import { cookies } from 'next/headers'
import { createServerClient } from '@supabase/ssr'

import { ensureSupabaseConfig } from './supabaseConfig'

export function createSupabaseServerClient() {
  const cookieStore = cookies()
  const config = ensureSupabaseConfig()

  return createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      get(name: string) {
        return cookieStore.get(name)?.value
      },
      set(name: string, value: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value, ...(options as object) })
        } catch {
          // noop during server render
        }
      },
      remove(name: string, options: Record<string, unknown>) {
        try {
          cookieStore.set({ name, value: '', ...(options as object), maxAge: 0 })
        } catch {
          // noop during server render
        }
      },
    },
  })
}
