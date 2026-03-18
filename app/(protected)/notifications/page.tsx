import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import type { TenantRole } from '@/lib/notificationRoles'

import { NotificationsClient } from './NotificationsClient'
import { PushSubscribeButton } from './PushSubscribeButton'

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,body,type,status,created_at,action_url,tenant_id')
    .order('created_at', { ascending: false })
    .limit(60)

  // Fetch user's roles across all tenants
  const { data: tenantMembers } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)

  // Build a map of tenant_id → roles for quick lookup
  const rolesByTenant = new Map<string, TenantRole[]>()
  if (tenantMembers) {
    for (const member of tenantMembers) {
      const roles = rolesByTenant.get(member.tenant_id) || []
      roles.push(member.role as TenantRole)
      rolesByTenant.set(member.tenant_id, roles)
    }
  }

  return (
    <div style={{ display: 'grid', gap: 20 }}>
      <NotificationsClient 
        initialNotifications={notifications ?? []} 
        userId={user.id}
        rolesByTenant={Object.fromEntries(rolesByTenant)}
      />
      <PushSubscribeButton />
    </div>
  )
}
