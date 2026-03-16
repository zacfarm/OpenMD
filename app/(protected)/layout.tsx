import Link from 'next/link'
import { redirect } from 'next/navigation'

import { getGlobalAdminAccess } from '@/lib/openmdAdmin'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { hasPermission, getRoleLabel, normalizeTenantRole } from '@/lib/rbac'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: memberships } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name,org_type)')
    .eq('user_id', user.id)
    .limit(1)

  const active = memberships?.[0]
  const activeTenant = Array.isArray(active?.tenants) ? active.tenants[0] : active?.tenants
  const adminAccess = await getGlobalAdminAccess()
  const role = active?.role ?? null
  const normalizedRole = normalizeTenantRole(role)

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="container" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 0' }}>
          <Link href="/dashboard" style={{ fontWeight: 800, textDecoration: 'none' }}>
            OpenMD
          </Link>
          <Link href="/dashboard">Dashboard</Link>
          {hasPermission(role, 'view_bookings') && normalizedRole !== 'billing' && (
            <Link href="/bookings">Bookings</Link>
          )}
          {hasPermission(role, 'view_bookings') && (
            <Link href="/calendar">Calendar</Link>
          )}
          {hasPermission(role, 'view_providers') && normalizedRole !== 'billing' && (
            <Link href="/providers">Providers</Link>
          )}
          {hasPermission(role, 'view_billing') && (
            <Link href="/billing">Billing</Link>
          )}
          {hasPermission(role, 'view_notifications') && (
            <Link href="/notifications">Notifications</Link>
          )}
          {hasPermission(role, 'view_credentials') && normalizedRole !== 'credentialing' && (
            <Link href="/credentials">Credentials</Link>
          )}
          {hasPermission(role, 'manage_team') && (
            <Link href="/settings/team">Team</Link>
          )}
          {(adminAccess.isGlobalAdmin || adminAccess.needsBootstrap) && <Link href="/admin">Admin</Link>}
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 13 }}>
            {activeTenant?.name ?? 'No workspace'} ({getRoleLabel(role)})
          </span>
          <form action="/logout" method="post">
            <button className="btn btn-secondary" type="submit">
              Logout
            </button>
          </form>
        </div>
      </header>
      <main className="container" style={{ padding: '26px 0 40px' }}>
        {children}
      </main>
    </div>
  )
}
