import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export default async function ProtectedLayout({ children }: { children: React.ReactNode }) {
  const supabase = createSupabaseServerClient()
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

  return (
    <div>
      <header style={{ borderBottom: '1px solid var(--line)', background: 'var(--surface)' }}>
        <div className="container" style={{ display: 'flex', gap: 16, alignItems: 'center', padding: '12px 0' }}>
          <Link href="/dashboard" style={{ fontWeight: 800, textDecoration: 'none' }}>
            OpenMD
          </Link>
          <Link href="/dashboard">Dashboard</Link>
          <Link href="/bookings">Bookings</Link>
          <Link href="/providers">Providers</Link>
          <Link href="/notifications">Notifications</Link>
          <Link href="/settings/team">Team</Link>
          <span style={{ marginLeft: 'auto', color: 'var(--muted)', fontSize: 13 }}>
            {activeTenant?.name ?? 'No workspace'} ({active?.role ?? 'n/a'})
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
