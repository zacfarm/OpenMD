import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { hasPermission, getRoleLabel, normalizeTenantRole } from '@/lib/rbac'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: memberships }, { count: unreadCount }] = await Promise.all([
    supabase
      .from('tenant_memberships')
      .select('tenant_id,role,tenants(name,org_type)')
      .eq('user_id', user.id)
      .limit(1),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'unread'),
  ])

  const active = memberships?.[0]
  const activeTenant = Array.isArray(active?.tenants) ? active.tenants[0] : active?.tenants
  const role = active?.role ?? null
  const normalizedRole = normalizeTenantRole(role)

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container app-header-inner">
          <div className="app-brand-wrap">
            <Link href="/dashboard" className="app-brand" aria-label="OpenMD Dashboard">
              OpenMD
            </Link>
            <span className="app-workspace-pill">
              {activeTenant?.name ?? 'No workspace'} • {getRoleLabel(role)}
            </span>
          </div>

          <nav className="app-nav" aria-label="Primary">
            <Link href="/dashboard" className="app-nav-link">Dashboard</Link>
            {hasPermission(role, 'view_bookings') && normalizedRole !== 'billing' && (
              <Link href="/bookings" className="app-nav-link">Bookings</Link>
            )}
            {hasPermission(role, 'view_providers') && normalizedRole !== 'billing' && (
              <Link href="/providers" className="app-nav-link">Providers</Link>
            )}
            {hasPermission(role, 'view_billing') && (
              <Link href="/billing" className="app-nav-link">Billing</Link>
            )}
            {hasPermission(role, 'view_notifications') && (
              <Link href="/notifications" className="app-nav-link app-nav-link-notifications">
                Notifications
                {unreadCount != null && unreadCount > 0 && (
                  <span className="app-notification-count">{unreadCount}</span>
                )}
              </Link>
            )}
            {hasPermission(role, 'view_credentials') && normalizedRole !== 'credentialing' && (
              <Link href="/credentials" className="app-nav-link">Credentials</Link>
            )}
            {hasPermission(role, 'manage_team') && (
              <Link href="/settings/team" className="app-nav-link">Team</Link>
            )}
          </nav>

          <form action="/logout" method="post" className="app-logout-form">
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
