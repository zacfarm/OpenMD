import { redirect } from 'next/navigation'

import CalendarWorkspace from '@/components/calendar/CalendarWorkspace'
import { getCalendarAccessContext, getCalendarEvents, getCalendarProviderOptions } from '@/lib/calendar'
import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { hasPermission } from '@/lib/rbac'

function getInitialRange() {
  const now = new Date()
  const start = new Date(now.getFullYear(), now.getMonth(), 1)
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999)

  return {
    from: start.toISOString(),
    to: end.toISOString(),
  }
}

export default async function CalendarPage() {
  const supabase = await createSupabaseServerClient()
  const access = await getCalendarAccessContext(supabase)

  if (!access) {
    redirect('/login')
  }

  if (!hasPermission(access.role, 'view_bookings') && !hasPermission(access.role, 'view_billing')) {
    redirect('/dashboard')
  }

  const initialRange = getInitialRange()
  const [providers, initialEvents] = await Promise.all([
    getCalendarProviderOptions(supabase, access.tenantId),
    getCalendarEvents(supabase, access, initialRange),
  ])

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Calendar</h1>
        <p style={{ color: 'var(--muted)', marginBottom: 0 }}>
          {access.isProviderView
            ? 'Your assigned shifts and cases.'
            : 'A role-aware schedule view across your current practice or facility.'}
        </p>
      </article>

      <CalendarWorkspace
        initialEvents={initialEvents}
        providers={providers}
        role={access.normalizedRole}
        isProviderView={access.isProviderView}
      />
    </section>
  )
}
