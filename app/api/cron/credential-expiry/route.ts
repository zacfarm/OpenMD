import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * GET /api/cron/credential-expiry
 *
 * Calls notify_expiring_credentials() to insert in-app notifications
 * for credentials expiring in 30 or 7 days.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const { data, error } = await supabase.rpc('notify_expiring_credentials')
  if (error) {
    console.error('[cron/credential-expiry]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  return NextResponse.json({ ok: true, sent: data })
}
