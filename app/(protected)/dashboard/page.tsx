import { createSupabaseServerClient } from '@/lib/supabaseServer'

export default async function DashboardPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: memberships } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name,org_type)')
    .eq('user_id', user!.id)

  const activeMembership = memberships?.[0]
  const activeTenant = Array.isArray(activeMembership?.tenants)
    ? activeMembership.tenants[0]
    : activeMembership?.tenants

  const [{ count: providerCount }, { count: bookingCount }, { count: unreadCount }] = await Promise.all([
    supabase.from('provider_profiles').select('id', { count: 'exact', head: true }),
    activeMembership
      ? supabase
          .from('booking_requests')
          .select('id', { count: 'exact', head: true })
          .eq('requesting_tenant_id', activeMembership.tenant_id)
      : Promise.resolve({ count: 0 } as { count: number }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'unread'),
  ])

  return (
    <section className="card" style={{ padding: 20 }}>
      <h1 style={{ marginTop: 0 }}>Workspace Dashboard</h1>
      <p style={{ color: 'var(--muted)' }}>
        Tenant: {activeTenant?.name ?? 'Not configured'} ({activeTenant?.org_type ?? 'n/a'})
      </p>
      <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 14 }}>
        <article className="card" style={{ padding: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Providers</h2>
          <p style={{ margin: '8px 0 0', fontSize: 30 }}>{providerCount ?? 0}</p>
        </article>
        <article className="card" style={{ padding: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Booking requests</h2>
          <p style={{ margin: '8px 0 0', fontSize: 30 }}>{bookingCount ?? 0}</p>
        </article>
        <article className="card" style={{ padding: 14 }}>
          <h2 style={{ margin: 0, fontSize: 16 }}>Unread notifications</h2>
          <p style={{ margin: '8px 0 0', fontSize: 30 }}>{unreadCount ?? 0}</p>
        </article>
      </div>
    </section>
  )
}
