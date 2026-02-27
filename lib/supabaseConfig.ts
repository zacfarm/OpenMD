export const MISSING_SUPABASE_CONFIG_MESSAGE =
  'Supabase environment variables are not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY).'

export type SupabaseConfig = {
  supabaseUrl: string
  supabaseAnonKey: string
}

let warned = false

export function getSupabaseConfig(): SupabaseConfig | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? ''
  const supabaseAnonKey =
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ??
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ??
    ''

  if (!supabaseUrl || !supabaseAnonKey) {
    if (!warned) {
      warned = true
      console.warn(MISSING_SUPABASE_CONFIG_MESSAGE)
    }
    return null
  }

  return {
    supabaseUrl,
    supabaseAnonKey,
  }
}

export function ensureSupabaseConfig(): SupabaseConfig {
  const config = getSupabaseConfig()
  if (!config) {
    throw new Error(MISSING_SUPABASE_CONFIG_MESSAGE)
  }
  return config
}
