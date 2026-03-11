import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getRoleLabel, hasPermission, normalizeTenantRole } from '@/lib/rbac'
import { revalidatePath } from 'next/cache'

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

  const { data: memberships } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name,org_type)')
    .eq('user_id', user!.id)

  const activeMembership = memberships?.[0]
  const activeTenant = Array.isArray(activeMembership?.tenants)
    ? activeMembership.tenants[0]
    : activeMembership?.tenants
  const role = normalizeTenantRole(activeMembership?.role)

  const [{ count: providerCount }, { count: bookingCount }, { count: unreadCount }, { count: claimsCount }] = await Promise.all([
    supabase.from('provider_profiles').select('id', { count: 'exact', head: true }),
    activeMembership
      ? supabase
          .from('booking_requests')
          .select('id', { count: 'exact', head: true })
          .eq('requesting_tenant_id', activeMembership.tenant_id)
      : Promise.resolve({ count: 0 } as { count: number }),
    supabase.from('notifications').select('id', { count: 'exact', head: true }).eq('status', 'unread'),
    activeMembership
      ? supabase
          .from('insurance_claims')
          .select('id', { count: 'exact', head: true })
          .eq('tenant_id', activeMembership.tenant_id)
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

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>{getRoleLabel(role)} Dashboard</h1>
        <p style={{ color: 'var(--muted)' }}>
          Tenant: {activeTenant?.name ?? 'Not configured'} ({activeTenant?.org_type ?? 'n/a'})
        </p>
        <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', marginTop: 14 }}>
          <article className="card" style={{ padding: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Providers</h2>
            <p style={{ margin: '8px 0 0', fontSize: 30 }}>{providerCount ?? 0}</p>
          </article>
          <article className="card" style={{ padding: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>{role === 'billing' ? 'Claims submitted' : 'Booking requests'}</h2>
            <p style={{ margin: '8px 0 0', fontSize: 30 }}>{role === 'billing' ? claimsCount ?? 0 : bookingCount ?? 0}</p>
          </article>
          <article className="card" style={{ padding: 14 }}>
            <h2 style={{ margin: 0, fontSize: 16 }}>Unread notifications</h2>
            <p style={{ margin: '8px 0 0', fontSize: 30 }}>{unreadCount ?? 0}</p>
          </article>
        </div>
      </article>

      {role === 'doctor' && (
        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Open shifts you can claim</h2>
          <p style={{ color: 'var(--muted)' }}>Claim posted shifts with one click for faster booking.</p>
          <div style={{ display: 'grid', gap: 10 }}>
            {(openFacilityShifts ?? []).length === 0 ? (
              <p style={{ margin: 0, color: 'var(--muted)' }}>No open facility shifts are available right now.</p>
            ) : (
              (openFacilityShifts ?? []).map((post) => (
                <div key={post.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10, display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'center' }}>
                  <div>
                    <p style={{ margin: 0, fontWeight: 700 }}>{post.title}</p>
                    <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                      {post.specialty ?? 'General'} | {post.location ?? 'No location'}
                    </p>
                  </div>
                  <form action={claimPostedShift}>
                    <input type="hidden" name="postId" value={post.id} />
                    <button className="btn btn-primary" type="submit">
                      Claim shift
                    </button>
                  </form>
                </div>
              ))
            )}
          </div>
        </article>
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
    </section>
  )
}
