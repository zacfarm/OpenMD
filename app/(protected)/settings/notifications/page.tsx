import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import type { TenantRole } from '@/lib/notificationRoles'

import { NotificationPreferencesClient } from './NotificationPreferencesClient'

export default async function NotificationSettingsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const { data: prefs } = await supabase
    .from('notification_preferences')
    .select('event_type,in_app,email')
    .eq('user_id', user.id)

  type PrefRow = { event_type: string; in_app: boolean; email: boolean }
  const prefsMap = Object.fromEntries(
    ((prefs ?? []) as PrefRow[]).map((p) => [p.event_type, { in_app: p.in_app, email: p.email }])
  )

  // Fetch user's roles across all tenants
  const { data: tenantMembers } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user.id)

  type TenantRoleRow = { role: TenantRole | null }
  const userRoles = Array.from(
    new Set(
      ((tenantMembers ?? []) as TenantRoleRow[])
        .map((m) => m.role)
        .filter((r): r is TenantRole => !!r)
    )
  )

  return <NotificationPreferencesClient initialPrefs={prefsMap} userRoles={userRoles} />
}
