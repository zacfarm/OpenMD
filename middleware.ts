import { NextResponse, type NextRequest } from 'next/server'
import { createServerClient } from '@supabase/ssr'

import { getSupabaseConfig } from '@/lib/supabaseConfig'

export async function middleware(req: NextRequest) {
  const config = getSupabaseConfig()
  if (!config) {
    return NextResponse.next({ request: { headers: req.headers } })
  }

  const res = NextResponse.next({ request: { headers: req.headers } })

  const supabase = createServerClient(config.supabaseUrl, config.supabaseAnonKey, {
    cookies: {
      getAll() {
        return req.cookies.getAll().map(({ name, value }) => ({ name, value }))
      },
      setAll(cookies) {
        cookies.forEach(({ name, value, options }) => {
          res.cookies.set(name, value, options)
        })
      },
    },
  })

  await supabase.auth.getUser()
  return res
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
}
