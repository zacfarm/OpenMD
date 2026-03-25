import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  try {
    const { inviteToken } = (await req.json()) as { inviteToken?: string }
    const token = (inviteToken ?? '').trim()

    if (!token) {
      return NextResponse.json({ ok: false, error: 'Missing invite token' }, { status: 400 })
    }

    const supabase = await createSupabaseServerClient()
    await supabase.rpc('mark_tenant_invite_opened', { invite_token_input: token })

    return NextResponse.json({ ok: true })
  } catch {
    return NextResponse.json({ ok: false }, { status: 200 })
  }
}
