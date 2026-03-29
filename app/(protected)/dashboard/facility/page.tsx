import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { normalizeTenantRole } from '@/lib/rbac'

type WeeklyPoint = {
  label: string
  utilizationPct: number
  utilizedProviders: number
}

type MonthlyPoint = {
  label: string
  amount: number
  count: number
}

function startOfUtcWeek(date: Date) {
  const d = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()))
  const day = d.getUTCDay()
  const diff = (day + 6) % 7
  d.setUTCDate(d.getUTCDate() - diff)
  return d
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }).format(value)
}

export default async function FacilityDashboardPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const role = normalizeTenantRole(membership?.role)
  if (role !== 'facility_manager' || !membership) {
    redirect('/dashboard')
  }

  const tenantId = membership.tenant_id

  const [{ data: providers }, { data: bookings }, { data: claims }] = await Promise.all([
    supabase
      .from('provider_profiles')
      .select('id')
      .eq('practice_tenant_id', tenantId),
    supabase
      .from('booking_requests')
      .select('provider_id,requested_start,status')
      .eq('requesting_tenant_id', tenantId)
      .in('status', ['accepted', 'confirmed']),
    supabase
      .from('insurance_claims')
      .select('submitted_at,billed_amount')
      .eq('tenant_id', tenantId),
  ])

  const providerCount = (providers ?? []).length

  const now = new Date()

  // Weekly utilization trend (last 8 full/partial weeks)
  const weeklyPoints: WeeklyPoint[] = []
  for (let i = 7; i >= 0; i -= 1) {
    const cursor = startOfUtcWeek(now)
    cursor.setUTCDate(cursor.getUTCDate() - i * 7)
    const weekKey = cursor.toISOString().slice(0, 10)

    const utilizedThisWeek = new Set(
      (bookings ?? [])
        .filter((b) => {
          const bookingWeek = startOfUtcWeek(new Date(b.requested_start)).toISOString().slice(0, 10)
          return bookingWeek === weekKey
        })
        .map((b) => b.provider_id),
    )

    const utilizedProviders = utilizedThisWeek.size
    const utilizationPct = providerCount > 0 ? Math.round((utilizedProviders / providerCount) * 100) : 0

    weeklyPoints.push({
      label: `${cursor.getUTCMonth() + 1}/${cursor.getUTCDate()}`,
      utilizationPct,
      utilizedProviders,
    })
  }

  // Monthly cost trend (last 6 months)
  const monthlyPoints: MonthlyPoint[] = []
  for (let i = 5; i >= 0; i -= 1) {
    const m = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - i, 1))
    const key = `${m.getUTCFullYear()}-${String(m.getUTCMonth() + 1).padStart(2, '0')}`

    const monthRows = (claims ?? []).filter((c) => c.submitted_at.slice(0, 7) === key)
    const amount = monthRows.reduce((sum, r) => sum + Number(r.billed_amount ?? 0), 0)

    monthlyPoints.push({
      label: `${m.toLocaleString('en-US', { month: 'short', timeZone: 'UTC' })} ${String(m.getUTCFullYear()).slice(-2)}`,
      amount,
      count: monthRows.length,
    })
  }

  const maxUtil = Math.max(1, ...weeklyPoints.map((p) => p.utilizationPct))
  const maxCost = Math.max(1, ...monthlyPoints.map((p) => p.amount))

  const total6MoCost = monthlyPoints.reduce((s, p) => s + p.amount, 0)
  const avgMonthlyCost = total6MoCost / Math.max(1, monthlyPoints.length)
  const total6MoClaims = monthlyPoints.reduce((s, p) => s + p.count, 0)
  const latestUtilization = weeklyPoints[weeklyPoints.length - 1]?.utilizationPct ?? 0
  const latestUtilizedProviders = weeklyPoints[weeklyPoints.length - 1]?.utilizedProviders ?? 0

  const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants

  return (
    <section className="dashboard-shell">
      <article className="card dashboard-hero">
        <div>
          <p className="dashboard-eyebrow">Facility manager analytics</p>
          <h1 style={{ marginBottom: 4 }}>Facility Performance Studio</h1>
          <p className="dashboard-subtext">
            {tenant?.name ?? 'Facility'} • utilization and financial trendline
          </p>
        </div>
        <div className="dashboard-actions">
          <Link className="btn btn-secondary" href="/dashboard">
            Back to dashboard
          </Link>
          <Link className="btn btn-primary" href="/billing">
            Open billing
          </Link>
        </div>
      </article>

      <section className="dashboard-metric-grid">
        <article className="card metric-tile">
          <p className="metric-label">Current utilization</p>
          <p className="metric-value">{latestUtilization}%</p>
          <p className="metric-hint">{latestUtilizedProviders}/{providerCount} providers booked this week</p>
        </article>
        <article className="card metric-tile">
          <p className="metric-label">6-month spend</p>
          <p className="metric-value">{formatMoney(total6MoCost)}</p>
          <p className="metric-hint">Total billed amount across last 6 months</p>
        </article>
        <article className="card metric-tile">
          <p className="metric-label">Avg monthly spend</p>
          <p className="metric-value">{formatMoney(avgMonthlyCost)}</p>
          <p className="metric-hint">Trailing 6-month monthly average</p>
        </article>
        <article className="card metric-tile">
          <p className="metric-label">Claims volume</p>
          <p className="metric-value">{total6MoClaims}</p>
          <p className="metric-hint">Claims submitted in the last 6 months</p>
        </article>
      </section>

      <section className="dashboard-two-col">
        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Weekly staff utilization (8 weeks)</h2>
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>
            Percent of providers with at least one accepted or confirmed booking each week.
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            {weeklyPoints.map((p) => (
              <div key={p.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 144px', gap: 10, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{p.label}</span>
                <div style={{ height: 14, background: '#e7efe9', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round((p.utilizationPct / maxUtil) * 100)}%`,
                      background: 'linear-gradient(90deg, #0c7a5a 0%, #18a878 100%)',
                    }}
                  />
                </div>
                <span style={{ fontSize: 13 }}>
                  {p.utilizationPct}% ({p.utilizedProviders}/{providerCount})
                </span>
              </div>
            ))}
          </div>
        </article>

        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Monthly claims cost trend (6 months)</h2>
          <p style={{ marginTop: 0, color: 'var(--muted)' }}>
            Tracks billed volume and spend by claim submission month.
          </p>

          <div style={{ display: 'grid', gap: 8 }}>
            {monthlyPoints.map((p) => (
              <div key={p.label} style={{ display: 'grid', gridTemplateColumns: '72px 1fr 188px', gap: 10, alignItems: 'center' }}>
                <span style={{ color: 'var(--muted)', fontSize: 13 }}>{p.label}</span>
                <div style={{ height: 14, background: '#edf1f9', borderRadius: 999, overflow: 'hidden' }}>
                  <div
                    style={{
                      height: '100%',
                      width: `${Math.round((p.amount / maxCost) * 100)}%`,
                      background: 'linear-gradient(90deg, #1f4b99 0%, #4f7ad1 100%)',
                    }}
                  />
                </div>
                <span style={{ fontSize: 13 }}>
                  {formatMoney(p.amount)} ({p.count} claims)
                </span>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 14 }}>
            <Link className="btn btn-primary" href="/providers">Review providers</Link>
            <Link className="btn btn-primary" href="/bookings">Open bookings</Link>
            <Link className="btn btn-primary" href="/notifications">View alerts</Link>
          </div>
        </article>
      </section>
    </section>
  )
}
