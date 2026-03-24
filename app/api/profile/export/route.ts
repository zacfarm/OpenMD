import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function GET() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const [
    profileRes,
    providerRes,
    settingsRes,
    membershipsRes,
    prefsRes,
    auditRes,
  ] = await Promise.all([
    supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
    supabase.from('provider_profiles').select('*').eq('user_id', user.id),
    supabase.from('user_profile_settings').select('*').eq('user_id', user.id).maybeSingle(),
    supabase.from('tenant_memberships').select('*').eq('user_id', user.id),
    supabase.from('notification_preferences').select('*').eq('user_id', user.id),
    supabase.from('user_security_audit_logs').select('*').eq('user_id', user.id).order('created_at', { ascending: false }).limit(200),
  ])

  const payload = {
    exportedAt: new Date().toISOString(),
    userId: user.id,
    profile: profileRes.data ?? null,
    providerProfiles: providerRes.data ?? [],
    profileSettings: settingsRes.data ?? null,
    memberships: membershipsRes.data ?? [],
    notificationPreferences: prefsRes.data ?? [],
    securityAuditLogs: auditRes.data ?? [],
  }

  return new NextResponse(JSON.stringify(payload, null, 2), {
    status: 200,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Content-Disposition': `attachment; filename="openmd-account-export-${user.id}.json"`,
      'Cache-Control': 'no-store',
    },
  })
}
