import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`
  }
  return value
}

function serializeCsvCell(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number' || typeof value === 'boolean') return String(value)
  return JSON.stringify(value)
}

function buildCsv(payload: {
  exportedAt: string
  userId: string
  profile: Record<string, unknown> | null
  providerProfiles: Array<Record<string, unknown>>
  profileSettings: Record<string, unknown> | null
  memberships: Array<Record<string, unknown>>
  notificationPreferences: Array<Record<string, unknown>>
  securityAuditLogs: Array<Record<string, unknown>>
}): string {
  const rows: string[][] = [['section', 'index', 'field', 'value']]

  rows.push(['meta', '', 'exportedAt', payload.exportedAt])
  rows.push(['meta', '', 'userId', payload.userId])

  const addObject = (section: string, obj: Record<string, unknown> | null) => {
    if (!obj) {
      rows.push([section, '', 'record', ''])
      return
    }

    for (const [field, value] of Object.entries(obj)) {
      rows.push([section, '', field, serializeCsvCell(value)])
    }
  }

  const addArray = (section: string, items: Array<Record<string, unknown>>) => {
    if (items.length === 0) {
      rows.push([section, '', 'record', ''])
      return
    }

    items.forEach((item, index) => {
      for (const [field, value] of Object.entries(item)) {
        rows.push([section, String(index), field, serializeCsvCell(value)])
      }
    })
  }

  addObject('profile', payload.profile)
  addArray('providerProfiles', payload.providerProfiles)
  addObject('profileSettings', payload.profileSettings)
  addArray('memberships', payload.memberships)
  addArray('notificationPreferences', payload.notificationPreferences)
  addArray('securityAuditLogs', payload.securityAuditLogs)

  return rows
    .map((row) => row.map((cell) => escapeCsvValue(cell)).join(','))
    .join('\n')
}

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
    profile: (profileRes.data as Record<string, unknown> | null) ?? null,
    providerProfiles: (providerRes.data as Array<Record<string, unknown>>) ?? [],
    profileSettings: (settingsRes.data as Record<string, unknown> | null) ?? null,
    memberships: (membershipsRes.data as Array<Record<string, unknown>>) ?? [],
    notificationPreferences: (prefsRes.data as Array<Record<string, unknown>>) ?? [],
    securityAuditLogs: (auditRes.data as Array<Record<string, unknown>>) ?? [],
  }

  const csv = buildCsv(payload)

  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="openmd-account-export-${user.id}.csv"`,
      'Cache-Control': 'no-store',
    },
  })
}
