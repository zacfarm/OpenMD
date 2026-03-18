import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getRoleLabel, hasPermission, normalizeTenantRole } from '@/lib/rbac'
import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { redirect } from 'next/navigation'

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

async function claimPostedShift(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'create_booking')) return

  const postId = String(formData.get('postId') || '')
  if (!postId) return

  await supabase.rpc('claim_marketplace_post', { post_id: postId })
  revalidatePath('/dashboard')
  revalidatePath('/bookings')
}

export default async function DashboardPage() {
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

  const activeMembership = memberships?.[0]
  const activeTenant = Array.isArray(activeMembership?.tenants)
    ? activeMembership.tenants[0]
    : activeMembership?.tenants
  const role = normalizeTenantRole(activeMembership?.role)

  const [{ count: providerCount }, { count: bookingCount }, { count: unreadCount }, { count: claimsCount }, { count: teamCount }, { count: openMarketplaceCount }] = await Promise.all([
    supabase.from('provider_profiles').select('id', { count: 'exact', head: true }),
    activeMembership
      ? supabase
          .from('booking_requests')
          .select('id', { count: 'exact', head: true })
          .eq('requesting_tenant_id', activeMembership.tenant_id)
      : Promise.resolve({ count: 0 } as { count: number }),
    supabase
      .from('notifications')
      .select('id', { count: 'exact', head: true })
      .eq('user_id', user.id)
      .eq('status', 'unread'),
    activeMembership
      ? supabase
          .from('insurance_claims')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', activeMembership.tenant_id)
      : Promise.resolve({ count: 0 } as { count: number }),
    activeMembership
      ? supabase
          .from('tenant_memberships')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', activeMembership.tenant_id)
      : Promise.resolve({ count: 0 } as { count: number }),
    activeMembership
      ? supabase
          .from('marketplace_posts')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', activeMembership.tenant_id)
          .eq('status', 'open')
      : Promise.resolve({ count: 0 } as { count: number }),
  ])

  const [{ data: openFacilityShifts }, { data: recentClaims }] = await Promise.all([
    role === 'doctor'
      ? supabase
          .from('marketplace_posts')
          .select('id,title,specialty,location,starts_at,ends_at')
          .eq('post_type', 'facility_request')
          .eq('status', 'open')
          .order('created_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as never[] }),
    hasPermission(role, 'view_billing') && activeMembership
      ? supabase
          .from('insurance_claims')
          .select('id,patient_name,status,billed_amount,insurance_payers(payer_name)')
          .eq('tenant_id', activeMembership.tenant_id)
          .order('submitted_at', { ascending: false })
          .limit(5)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const claimRows = (recentClaims ?? []) as Array<{
    id: string
    patient_name: string
    status: string
    billed_amount: number
    insurance_payers: { payer_name: string } | { payer_name: string }[] | null
  }>

  let utilizationRate = 0
  let utilizedProvidersCount = 0
  let totalCost = 0
  let pendingClaimsCost = 0
  let avgClaimCost = 0
  let onboardingRows: Array<{
    providerId: string
    name: string
    createdAt: string
    completed: number
    total: number
    items: Array<{ label: string; done: boolean }>
  }> = []

  if (role === 'facility_manager' && activeMembership) {
    const { data: tenantProviders } = await supabase
      .from('provider_profiles')
      .select('id,user_id,display_name,specialty,created_at')
      .eq('practice_tenant_id', activeMembership.tenant_id)

    const providerIds = (tenantProviders ?? []).map((p) => p.id)

    if (providerIds.length > 0) {
      const [availabilityRes, credentialsRes, bookingsRes, claimsRes] = await Promise.all([
        supabase
          .from('provider_availability')
          .select('provider_id')
          .in('provider_id', providerIds),
        supabase
          .from('provider_credentials')
          .select('provider_id,status')
          .eq('tenant_id', activeMembership.tenant_id)
          .in('provider_id', providerIds),
        supabase
          .from('booking_requests')
          .select('provider_id,status')
          .eq('requesting_tenant_id', activeMembership.tenant_id)
          .in('provider_id', providerIds),
        supabase
          .from('insurance_claims')
          .select('billed_amount,status')
          .eq('tenant_id', activeMembership.tenant_id),
      ])

      const availabilitySet = new Set((availabilityRes.data ?? []).map((r) => r.provider_id))
      const providerCredentialRows = (credentialsRes.data ?? [])
      const providerBookingRows = (bookingsRes.data ?? [])
      const claimCostRows = claimsRes.data ?? []

      const utilizedProviderSet = new Set(
        providerBookingRows
          .filter((r) => r.status === 'accepted' || r.status === 'confirmed')
          .map((r) => r.provider_id),
      )

      utilizedProvidersCount = utilizedProviderSet.size
      utilizationRate = providerIds.length > 0 ? Math.round((utilizedProvidersCount / providerIds.length) * 100) : 0

      totalCost = claimCostRows.reduce((sum, row) => sum + Number(row.billed_amount ?? 0), 0)
      pendingClaimsCost = claimCostRows
        .filter((row) => row.status === 'submitted')
        .reduce((sum, row) => sum + Number(row.billed_amount ?? 0), 0)
      avgClaimCost = claimCostRows.length > 0 ? totalCost / claimCostRows.length : 0

      const sixtyDaysAgo = new Date()
      sixtyDaysAgo.setDate(sixtyDaysAgo.getDate() - 60)

      onboardingRows = (tenantProviders ?? [])
        .filter((p) => new Date(p.created_at) >= sixtyDaysAgo)
        .map((provider) => {
          const creds = providerCredentialRows.filter((c) => c.provider_id === provider.id)
          const providerBookings = providerBookingRows.filter((b) => b.provider_id === provider.id)

          const items = [
            { label: 'Provider profile completed', done: Boolean(provider.display_name && provider.specialty) },
            { label: 'At least 1 credential uploaded', done: creds.length > 0 },
            { label: 'At least 1 credential approved', done: creds.some((c) => c.status === 'approved') },
            { label: 'Availability added', done: availabilitySet.has(provider.id) },
            { label: 'Booking activity started', done: providerBookings.length > 0 },
          ]

          const completed = items.filter((item) => item.done).length
          return {
            providerId: provider.id,
            name: provider.display_name,
            createdAt: provider.created_at,
            completed,
            total: items.length,
            items,
          }
        })
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    }
  }

  return (
    <section className="dashboard-shell">
      <article className="card dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">{getRoleLabel(role)} workspace</p>
          <h1>
            {role === 'admin'
              ? 'Admin Command Center'
              : role === 'doctor'
                ? 'Provider Workbench'
                : `${getRoleLabel(role)} Dashboard`}
          </h1>
          <p className="dashboard-subtext">
            {activeTenant?.name ?? 'No active tenant'} ({activeTenant?.org_type ?? 'n/a'})
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn btn-primary" href="/notifications">
            View notifications
          </Link>
          {hasPermission(role, 'view_bookings') && (
            <Link className="btn btn-secondary" href="/bookings">
              Open bookings
            </Link>
          )}
        </div>
      </article>

      <section className="dashboard-metric-grid">
        <article className="card metric-tile">
          <p className="metric-label">Providers</p>
          <p className="metric-value">{providerCount ?? 0}</p>
          <p className="metric-hint">Networked clinicians in your ecosystem</p>
        </article>
        <article className="card metric-tile">
          <p className="metric-label">{role === 'billing' ? 'Claims submitted' : 'Booking requests'}</p>
          <p className="metric-value">{role === 'billing' ? claimsCount ?? 0 : bookingCount ?? 0}</p>
          <p className="metric-hint">Current activity volume</p>
        </article>
        <article className="card metric-tile">
          <p className="metric-label">Unread notifications</p>
          <p className="metric-value">{unreadCount ?? 0}</p>
          <p className="metric-hint">Alerts waiting for your action</p>
        </article>
        <article className="card metric-tile">
          <p className="metric-label">Active team</p>
          <p className="metric-value">{teamCount ?? 0}</p>
          <p className="metric-hint">Members in current tenant</p>
        </article>
      </section>

      {role === 'admin' && (
        <section className="dashboard-two-col">
          <article className="card" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Operations overview</h2>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              High-level admin visibility across staffing, billing, and team operations.
            </p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))' }}>
              <article className="dashboard-mini-stat">
                <p className="metric-label">Open marketplace posts</p>
                <p className="metric-value">{openMarketplaceCount ?? 0}</p>
              </article>
              <article className="dashboard-mini-stat">
                <p className="metric-label">Total claims</p>
                <p className="metric-value">{claimsCount ?? 0}</p>
              </article>
              <article className="dashboard-mini-stat">
                <p className="metric-label">Bookings queue</p>
                <p className="metric-value">{bookingCount ?? 0}</p>
              </article>
            </div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
              <Link href="/settings/team" className="btn btn-secondary">Manage team</Link>
              <Link href="/billing" className="btn btn-secondary">Review billing</Link>
              <Link href="/providers" className="btn btn-secondary">Provider directory</Link>
            </div>
          </article>

          <article className="card" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Claims snapshot</h2>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>
              Recent financial signal for quick admin decisions.
            </p>
            {claimRows.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>No claims activity yet.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {claimRows.map((claim) => {
                  const payer = Array.isArray(claim.insurance_payers) ? claim.insurance_payers[0] : claim.insurance_payers
                  return (
                    <article key={claim.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                      <p style={{ margin: 0, fontWeight: 700 }}>{claim.patient_name}</p>
                      <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                        {payer?.payer_name ?? 'Unknown payer'} • {formatMoney(claim.billed_amount)} • {claim.status}
                      </p>
                    </article>
                  )
                })}
              </div>
            )}
          </article>
        </section>
      )}

      {role === 'doctor' && (
        <section className="dashboard-two-col" style={{ gridTemplateColumns: '1.25fr 0.75fr' }}>
          <article className="card" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Open shifts you can claim</h2>
            <p style={{ color: 'var(--muted)' }}>Claim posted shifts with one click and fill your schedule faster.</p>
            <div style={{ display: 'grid', gap: 10 }}>
            {(openFacilityShifts ?? []).length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>No open facility shifts are available right now.</p>
            ) : (
              (openFacilityShifts ?? []).map((post) => (
                <article key={post.id} className="dashboard-shift-row">
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{post.title}</p>
                    <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                      {post.specialty ?? 'General'} • {post.location ?? 'No location'}
                    </p>
                    <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>
                      {new Date(post.starts_at).toLocaleDateString()} {post.ends_at ? `to ${new Date(post.ends_at).toLocaleDateString()}` : ''}
                    </p>
                  </div>
                  <form action={claimPostedShift}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button className="btn btn-primary" type="submit">
                      Claim shift
                    </button>
                  </form>
                </article>
              ))
            )}
            </div>
          </article>

          <article className="card" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Provider quick actions</h2>
            <p style={{ marginTop: 0, color: 'var(--muted)' }}>Everything you need to stay booked and compliant.</p>
            <div style={{ display: 'grid', gap: 8 }}>
              <Link href="/bookings" className="btn btn-secondary">View my bookings</Link>
              <Link href="/credentials" className="btn btn-secondary">Update credentials</Link>
              <Link href="/notifications" className="btn btn-secondary">Check alerts</Link>
              <Link href="/providers" className="btn btn-secondary">Explore providers</Link>
            </div>
          </article>
        </section>
      )}

      {role === 'billing' && (
        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Claims work queue</h2>
          <p style={{ color: 'var(--muted)' }}>Select payers from the configured database and submit claims from the billing portal.</p>
          <p style={{ marginBottom: 12 }}>
            <a href="/billing">Open billing portal</a>
          </p>
          <div style={{ display: 'grid', gap: 10 }}>
            {claimRows.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>No claims have been submitted yet.</p>
            ) : (
              claimRows.map((claim) => {
                const payer = Array.isArray(claim.insurance_payers) ? claim.insurance_payers[0] : claim.insurance_payers
                return (
                  <div key={claim.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>{claim.patient_name}</p>
                    <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                      {payer?.payer_name ?? 'Unknown payer'} | ${claim.billed_amount.toFixed(2)} | {claim.status}
                    </p>
                  </div>
                )
              })
            )}
          </div>
        </article>
      )}

      {role === 'credentialing' && (
        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Scheduler queue</h2>
          <p style={{ color: 'var(--muted)' }}>Manage bookings, provider readiness, and open staffing requests from one place.</p>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
            <article className="card" style={{ padding: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Open booking workload</h3>
              <p style={{ margin: '8px 0 0', fontSize: 26 }}>{bookingCount ?? 0}</p>
            </article>
            <article className="card" style={{ padding: 14 }}>
              <h3 style={{ margin: 0, fontSize: 16 }}>Providers in network</h3>
              <p style={{ margin: '8px 0 0', fontSize: 26 }}>{providerCount ?? 0}</p>
            </article>
          </div>
        </article>
      )}

      {role === 'facility_manager' && (
        <>
          <article className="card" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>Staff utilization and cost dashboard</h2>
            <p style={{ color: 'var(--muted)' }}>
              Snapshot of provider engagement and billing spend for your facility.
            </p>
            <p style={{ marginTop: 0 }}>
              <a href="/dashboard/facility">Open full analytics dashboard</a>
            </p>

            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
              <article className="card" style={{ padding: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Provider utilization</h3>
                <p style={{ margin: '8px 0 0', fontSize: 26 }}>{utilizationRate}%</p>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  {utilizedProvidersCount} of {providerCount ?? 0} providers with accepted/confirmed bookings
                </p>
              </article>

              <article className="card" style={{ padding: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Total claim cost</h3>
                <p style={{ margin: '8px 0 0', fontSize: 26 }}>${totalCost.toFixed(2)}</p>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  Avg claim: ${avgClaimCost.toFixed(2)}
                </p>
              </article>

              <article className="card" style={{ padding: 14 }}>
                <h3 style={{ margin: 0, fontSize: 16 }}>Pending claims value</h3>
                <p style={{ margin: '8px 0 0', fontSize: 26 }}>${pendingClaimsCost.toFixed(2)}</p>
                <p style={{ margin: '4px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                  Submitted claims awaiting downstream processing
                </p>
              </article>
            </div>
          </article>

          <article className="card" style={{ padding: 18 }}>
            <h2 style={{ marginTop: 0 }}>New provider onboarding checklist</h2>
            <p style={{ color: 'var(--muted)' }}>
              Tracks providers created in the last 60 days and their onboarding progress.
            </p>

            {onboardingRows.length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>No newly added providers in the last 60 days.</p>
            ) : (
              <div style={{ display: 'grid', gap: 10 }}>
                {onboardingRows.map((row) => (
                  <div key={row.providerId} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                    <p style={{ margin: 0, fontWeight: 700 }}>
                      {row.name} <span style={{ color: 'var(--muted)', fontWeight: 400 }}>({row.completed}/{row.total})</span>
                    </p>
                    <p style={{ margin: '4px 0 8px', color: 'var(--muted)', fontSize: 13 }}>
                      Added {new Date(row.createdAt).toLocaleDateString()}
                    </p>
                    <div style={{ display: 'grid', gap: 4 }}>
                      {row.items.map((item) => (
                        <p key={item.label} style={{ margin: 0, fontSize: 13, color: item.done ? 'var(--accent)' : 'var(--muted)' }}>
                          {item.done ? '✓' : '○'} {item.label}
                        </p>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </article>
        </>
      )}
    </section>
  )
}
