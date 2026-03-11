import { createSupabaseServerClient } from '@/lib/supabaseServer'

async function addProvider(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const name = String(formData.get('displayName') || '').trim()
  const specialty = String(formData.get('specialty') || '').trim() || null
  const city = String(formData.get('city') || '').trim() || null
  const state = String(formData.get('state') || '').trim() || null

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !name) return

  await supabase.from('provider_profiles').insert({
    display_name: name,
    specialty,
    home_city: city,
    home_state: state,
    practice_tenant_id: membership.tenant_id,
  })
}

async function addAvailability(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const providerId = String(formData.get('providerId') || '')

  if (!providerId) return

  await supabase.from('provider_availability').insert({
    provider_id: providerId,
    weekday: Number(formData.get('weekday')),
    start_time: String(formData.get('startTime') || ''),
    end_time: String(formData.get('endTime') || ''),
    location: String(formData.get('location') || '').trim() || null,
    created_by: (await supabase.auth.getUser()).data.user?.id,
  })
}

async function addTimeOff(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const providerId = String(formData.get('providerId') || '')

  if (!providerId) return

  await supabase.from('provider_time_off').insert({
    provider_id: providerId,
    starts_at: String(formData.get('startsAt') || ''),
    ends_at: String(formData.get('endsAt') || ''),
    reason: String(formData.get('reason') || '').trim() || null,
    created_by: (await supabase.auth.getUser()).data.user?.id,
  })
}

export default async function ProvidersPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,tenants(name,org_type)')
    .eq('user_id', user?.id ?? '')
    .limit(1)
    .maybeSingle()

  const tenantId = membership?.tenant_id ?? null
  const activeTenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants

  const { data: providers } = await supabase
    .from('provider_profiles')
    .select('id,display_name,specialty,home_city,home_state,provider_availability(id,weekday,start_time,end_time,location),provider_time_off(id,starts_at,ends_at,reason)')
    .eq('practice_tenant_id', tenantId)
    .order('created_at', { ascending: false })

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Provider Scheduling</h1>
        <p style={{ color: 'var(--muted)' }}>
          Add provider records for {activeTenant?.name ?? 'your workspace'} and maintain availability/time-off blocks.
        </p>
        <form action={addProvider} style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr 1fr 1fr auto' }}>
          <input className="field" name="displayName" placeholder="Provider name" required />
          <input className="field" name="specialty" placeholder="Specialty" />
          <input className="field" name="city" placeholder="City" />
          <input className="field" name="state" placeholder="State" />
          <button className="btn btn-primary" type="submit">
            Add provider
          </button>
        </form>
      </article>

      {(providers ?? []).map((provider) => (
        <article className="card" style={{ padding: 18 }} key={provider.id}>
          <h2 style={{ marginTop: 0 }}>{provider.display_name}</h2>
          <p style={{ color: 'var(--muted)' }}>
            {provider.specialty ?? 'No specialty'} | {provider.home_city ?? 'N/A'}, {provider.home_state ?? 'N/A'}
          </p>

          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 1fr' }}>
            <form action={addAvailability} style={{ display: 'grid', gap: 8 }}>
              <input type="hidden" name="providerId" value={provider.id} />
              <h3 style={{ margin: '4px 0' }}>Weekly availability</h3>
              <select className="field" name="weekday" defaultValue="1">
                <option value="0">Sunday</option>
                <option value="1">Monday</option>
                <option value="2">Tuesday</option>
                <option value="3">Wednesday</option>
                <option value="4">Thursday</option>
                <option value="5">Friday</option>
                <option value="6">Saturday</option>
              </select>
              <input className="field" type="time" name="startTime" required />
              <input className="field" type="time" name="endTime" required />
              <input className="field" name="location" placeholder="Location" />
              <button className="btn btn-secondary" type="submit">
                Save availability
              </button>
            </form>

            <form action={addTimeOff} style={{ display: 'grid', gap: 8 }}>
              <input type="hidden" name="providerId" value={provider.id} />
              <h3 style={{ margin: '4px 0' }}>Time off</h3>
              <input className="field" type="datetime-local" name="startsAt" required />
              <input className="field" type="datetime-local" name="endsAt" required />
              <input className="field" name="reason" placeholder="Reason" />
              <button className="btn btn-secondary" type="submit">
                Add block
              </button>
            </form>
          </div>
        </article>
      ))}
    </section>
  )
}
