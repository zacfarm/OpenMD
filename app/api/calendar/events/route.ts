import { NextResponse } from 'next/server'

import { getCalendarAccessContext, getCalendarEvents } from '@/lib/calendar'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient()
  const access = await getCalendarAccessContext(supabase)

  if (!access) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const events = await getCalendarEvents(supabase, access, {
    providerId: searchParams.get('providerId') || undefined,
    status: searchParams.get('status') || undefined,
    practice: searchParams.get('practice') || undefined,
    facility: searchParams.get('facility') || undefined,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
  })

  return NextResponse.json({
    role: access.normalizedRole,
    tenantId: access.tenantId,
    events,
  })
}
