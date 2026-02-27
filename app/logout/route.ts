import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  const supabase = createSupabaseServerClient()
  await supabase.auth.signOut()

  return NextResponse.redirect(new URL('/login', req.url))
}
