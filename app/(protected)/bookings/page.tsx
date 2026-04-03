import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import {
  getCalendarProviderOptions,
  getScheduleInsuranceOptions,
  getScheduleLocationOptions,
  getScheduleProcedureTypeOptions,
} from '@/lib/calendar'
import { hasPermission } from '@/lib/rbac'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

interface MarketplacePost {
  id: string
  post_type: 'facility_request' | 'provider_offer'
  title: string
  specialty: string | null
  location: string | null
  starts_at: string | null
  ends_at: string | null
  details: string | null
  status: 'open' | 'claimed' | 'closed'
  created_by: string
  claimed_by_user_id: string | null
  created_at: string
  patient_first_name: string | null
  patient_last_name: string | null
  patient_city: string | null
  patient_state: string | null
  visit_type: 'inpatient' | 'outpatient' | null
}

function buildCaseIdentifier() {
  return `CASE-${Date.now().toString().slice(-8)}`
}

async function createMarketplacePost(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const postType = String(formData.get('postType') || '')
  if (!['facility_request', 'provider_offer'].includes(postType)) {
    redirect('/bookings?error=Invalid marketplace post type.')
  }

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name,org_type)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'create_marketplace_post')) {
    redirect('/bookings?error=You do not have permission to publish marketplace posts.')
  }

  const tenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants

  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const title = String(formData.get('title') || '').trim()
  const specialty = String(formData.get('specialty') || '').trim() || null
  const location = String(formData.get('location') || '').trim() || null
  const startsAt = String(formData.get('startsAt') || '').trim() || null
  const endsAt = String(formData.get('endsAt') || '').trim() || null
  const details = String(formData.get('details') || '').trim() || null

  if (!title) {
    redirect('/bookings?error=Title is required.')
  }

  if (postType === 'facility_request') {
    const patientFirstName = String(formData.get('patientFirstName') || '').trim()
    const patientLastName = String(formData.get('patientLastName') || '').trim()
    const patientAddressLine1 = String(formData.get('patientAddressLine1') || '').trim()
    const patientCity = String(formData.get('patientCity') || '').trim()
    const patientState = String(formData.get('patientState') || '').trim()
    const patientZip = String(formData.get('patientZip') || '').trim()
    const patientSex = String(formData.get('patientSex') || '').trim()
    const visitType = String(formData.get('visitType') || '').trim()
    const locationId = String(formData.get('locationId') || '').trim()
    const insuranceCompanyId = String(formData.get('insuranceCompanyId') || '').trim()
    const procedureTypeId = String(formData.get('procedureTypeId') || '').trim()
    const selectedProviderId = String(formData.get('providerId') || '').trim()

    if (!patientFirstName || !patientLastName || !patientAddressLine1 || !patientCity || !patientState || !patientZip || !patientSex || !visitType || !locationId || !insuranceCompanyId || !procedureTypeId || !startsAt || !endsAt) {
      redirect('/bookings?error=Facility requests require all case intake fields except provider.')
    }

    const startsAtDate = new Date(startsAt)
    const endsAtDate = new Date(endsAt)
    if (Number.isNaN(startsAtDate.getTime()) || Number.isNaN(endsAtDate.getTime()) || endsAtDate <= startsAtDate) {
      redirect('/bookings?error=End time must be after start time.')
    }

    const { data: locationRow } = await supabase
      .from('tenant_schedule_locations')
      .select('id,tenant_id,name,address_line_1,city,state,zip')
      .eq('id', locationId)
      .maybeSingle()
    const locationOption = locationRow as { id: string; tenant_id: string; name: string; address_line_1: string; city: string; state: string; zip: string } | null
    if (!locationOption || locationOption.tenant_id !== membership?.tenant_id) {
      redirect('/bookings?error=Selected location is not part of this workspace.')
    }

    const { data: insuranceRow } = await supabase
      .from('tenant_schedule_insurance_companies')
      .select('id,tenant_id,name')
      .eq('id', insuranceCompanyId)
      .maybeSingle()
    const insuranceOption = insuranceRow as { id: string; tenant_id: string; name: string } | null
    if (!insuranceOption || insuranceOption.tenant_id !== membership?.tenant_id) {
      redirect('/bookings?error=Selected insurance company is not part of this workspace.')
    }

    const { data: procedureTypeRow } = await supabase
      .from('tenant_schedule_procedure_types')
      .select('id,tenant_id,name')
      .eq('id', procedureTypeId)
      .maybeSingle()
    const procedureType = procedureTypeRow as { id: string; tenant_id: string; name: string } | null
    if (!procedureType || procedureType.tenant_id !== membership?.tenant_id) {
      redirect('/bookings?error=Selected procedure type is not part of this workspace.')
    }

    let selectedProvider: { id: string; practice_tenant_id: string | null } | null = null
    if (selectedProviderId) {
      const { data: providerRow } = await supabase
        .from('provider_profiles')
        .select('id,practice_tenant_id')
        .eq('id', selectedProviderId)
        .maybeSingle()
      selectedProvider = providerRow as { id: string; practice_tenant_id: string | null } | null
      if (!selectedProvider || selectedProvider.practice_tenant_id !== membership?.tenant_id) {
        redirect('/bookings?error=Selected provider is not part of this workspace.')
      }
    }

    const facilityLocation = `${locationOption.name} · ${locationOption.address_line_1}, ${locationOption.city}, ${locationOption.state} ${locationOption.zip}`

    const { data: marketplacePost, error } = await supabase.from('marketplace_posts').insert({
      post_type: 'facility_request',
      tenant_id: membership?.tenant_id ?? null,
      provider_id: selectedProvider?.id ?? null,
      title,
      specialty: procedureType.name,
      location: facilityLocation,
      starts_at: startsAt,
      ends_at: endsAt,
      details,
      status: selectedProvider?.id ? 'claimed' : 'open',
      created_by: user.id,
      claimed_by_user_id: selectedProvider?.id ? user.id : null,
      claimed_at: selectedProvider?.id ? new Date().toISOString() : null,
      patient_first_name: patientFirstName,
      patient_last_name: patientLastName,
      patient_address_line_1: patientAddressLine1,
      patient_city: patientCity,
      patient_state: patientState,
      patient_zip: patientZip,
      patient_sex: patientSex,
      visit_type: visitType,
      location_id: locationOption.id,
      insurance_company_id: insuranceOption.id,
      procedure_type_id: procedureType.id,
    })
    .select('id')
    .single()

    if (error || !marketplacePost) {
      redirect(`/bookings?error=${encodeURIComponent(error.message)}`)
    }

    if (selectedProvider && membership?.tenant_id) {
      const { error: scheduleError } = await supabase.from('schedule_events').insert({
        tenant_id: membership.tenant_id,
        provider_id: selectedProvider.id,
        title,
        case_identifier: buildCaseIdentifier(),
        patient_display_name: `${patientLastName}, ${patientFirstName}`,
        patient_first_name: patientFirstName,
        patient_last_name: patientLastName,
        patient_address_line_1: patientAddressLine1,
        patient_city: patientCity,
        patient_state: patientState,
        patient_zip: patientZip,
        patient_sex: patientSex,
        visit_type: visitType,
        procedure_type_id: procedureType.id,
        case_type: procedureType.name,
        status: 'confirmed',
        starts_at: startsAt,
        ends_at: endsAt,
        location_id: locationOption.id,
        insurance_company_id: insuranceOption.id,
        location: facilityLocation,
        practice_name: tenant?.org_type === 'practice' ? tenant.name ?? null : null,
        facility_name: tenant?.org_type === 'facility' ? tenant.name ?? null : null,
        notes: details,
        metadata: {
          source: 'marketplace_post',
          marketplace_post_id: marketplacePost.id,
          post_type: 'facility_request',
        },
        created_by: user.id,
        updated_by: user.id,
      } as never)

      if (scheduleError) {
        await supabase.from('marketplace_posts').delete().eq('id', marketplacePost.id)
        redirect(`/bookings?error=${encodeURIComponent(scheduleError.message)}`)
      }
    }

    revalidatePath('/bookings')
    revalidatePath('/calendar')
    revalidatePath('/schedule-cases')
    redirect('/bookings?success=Marketplace case post published.')
  }

  const { error } = await supabase.from('marketplace_posts').insert({
    post_type: postType,
    tenant_id: membership?.tenant_id ?? null,
    provider_id: providerProfile?.id ?? null,
    title,
    specialty,
    location,
    starts_at: startsAt,
    ends_at: endsAt,
    details,
    created_by: user.id,
  })

  if (error) {
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/bookings')
  redirect('/bookings?success=Marketplace post published.')
}

async function claimMarketplacePost(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const postId = String(formData.get('postId') || '')
  if (!postId) {
    redirect('/bookings?error=Missing marketplace post.')
  }

  const { data: post } = await supabase
    .from('marketplace_posts')
    .select('created_by,status,claimed_by_user_id')
    .eq('id', postId)
    .maybeSingle()

  if (!post) {
    redirect('/bookings?error=Marketplace post not found.')
  }

  if (post.status !== 'open') {
    redirect('/bookings?error=This post is no longer open.')
  }

  if (post.claimed_by_user_id !== null) {
    redirect('/bookings?error=This post has already been claimed.')
  }

  if (post.created_by === user.id) {
    redirect('/bookings?error=You cannot claim your own post.')
  }

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()
  if (!hasPermission(membership?.role, 'create_booking')) {
    redirect('/bookings?error=You do not have permission to claim marketplace posts.')
  }

  const { error } = await supabase.rpc('claim_marketplace_post_text', { post_id_input: postId })
  if (error) {
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/bookings')
  revalidatePath('/calendar')
  revalidatePath('/schedule-cases')
  redirect('/bookings?success=Marketplace post claimed.')
}

async function closeMarketplacePost(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'manage_bookings')) {
    redirect('/bookings?error=You do not have permission to close marketplace posts.')
  }

  const postId = String(formData.get('postId') || '')
  if (!postId) {
    redirect('/bookings?error=Missing marketplace post.')
  }

  const { error } = await supabase
    .from('marketplace_posts')
    .update({ status: 'closed' })
    .eq('id', postId)
    .eq('created_by', user.id)

  if (error) {
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/bookings')
  redirect('/bookings?success=Marketplace post closed.')
}

export default async function BookingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string
    success?: string
    procedureType?: string
    serviceDate?: string
    hospital?: string
    state?: string
  }>
}) {
  const resolvedSearchParams = await searchParams

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name,org_type)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const role = membership?.role ?? null
  const tenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants

  const [providers, locations, insuranceCompanies, procedureTypes] = await Promise.all([
    getCalendarProviderOptions(supabase, membership?.tenant_id ?? null),
    getScheduleLocationOptions(supabase, membership?.tenant_id ?? null),
    getScheduleInsuranceOptions(supabase, membership?.tenant_id ?? null),
    getScheduleProcedureTypeOptions(supabase, membership?.tenant_id ?? null),
  ])

  const { data: posts } = await supabase
    .from('marketplace_posts')
    .select('id,post_type,title,specialty,location,starts_at,ends_at,details,status,created_by,claimed_by_user_id,created_at,patient_first_name,patient_last_name,patient_city,patient_state,visit_type')
    .order('created_at', { ascending: false })
    .limit(100) as { data: MarketplacePost[] | null }

  const allPosts = posts ?? []
  const selectedProcedureType = resolvedSearchParams?.procedureType ?? ''
  const selectedServiceDate = resolvedSearchParams?.serviceDate ?? ''
  const selectedHospital = resolvedSearchParams?.hospital ?? ''
  const selectedState = resolvedSearchParams?.state ?? ''
  const hospitalOptions = Array.from(new Set(locations.map((locationOption) => locationOption.label))).sort((a, b) => a.localeCompare(b))
  const stateOptions = Array.from(new Set(locations.map((locationOption) => locationOption.state))).sort((a, b) => a.localeCompare(b))

  const filteredPosts = allPosts.filter((post) => {
    if (selectedProcedureType && post.specialty !== selectedProcedureType) return false
    if (selectedServiceDate && (!post.starts_at || post.starts_at.slice(0, 10) !== selectedServiceDate)) return false
    if (selectedHospital && post.location !== selectedHospital) return false
    if (selectedState) {
      const locationHasState = post.location?.includes(`, ${selectedState} `) ?? false
      const patientHasState = post.patient_state === selectedState
      if (!locationHasState && !patientHasState) return false
    }
    return true
  })

  const myPosts = filteredPosts.filter((post) => post.created_by === user.id)
  const myClaimedPosts = filteredPosts.filter((post) => post.claimed_by_user_id === user.id && post.created_by !== user.id)
  const availableToClaimPosts = filteredPosts.filter((post) => post.status === 'open' && post.created_by !== user.id && post.claimed_by_user_id === null)

  const renderPost = (post: MarketplacePost, currentUserRole: string | null, userId: string) => {
    const isCreator = userId === post.created_by
    const isOpen = post.status === 'open'
    const canClaimPost = !isCreator && isOpen && post.claimed_by_user_id === null && hasPermission(currentUserRole, 'create_booking')
    const patientLabel = [post.patient_first_name, post.patient_last_name].filter(Boolean).join(' ')

    return (
      <div key={post.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
        <p style={{ margin: 0, fontWeight: 700 }}>
          {post.title} ({post.post_type === 'facility_request' ? 'Facility Request' : 'Provider Offer'})
        </p>
        <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
          {post.specialty ?? 'General'} | {post.location ?? 'No location'} | Status: {post.status}
        </p>
        {patientLabel && (
          <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
            {patientLabel}{post.patient_city || post.patient_state ? ` · ${[post.patient_city, post.patient_state].filter(Boolean).join(', ')}` : ''}{post.visit_type ? ` · ${post.visit_type}` : ''}
          </p>
        )}
        {(post.starts_at || post.ends_at) && (
          <p style={{ margin: '4px 0' }}>
            {post.starts_at ? new Date(post.starts_at).toLocaleString() : 'TBD'} -{' '}
            {post.ends_at ? new Date(post.ends_at).toLocaleString() : 'TBD'}
          </p>
        )}
        {post.details && <p style={{ margin: '4px 0' }}>{post.details}</p>}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>
          {canClaimPost && (
            <form action={claimMarketplacePost}>
              <input type="hidden" name="postId" value={post.id} />
              <button className="btn btn-secondary" type="submit">
                Claim
              </button>
            </form>
          )}

          {isCreator && isOpen && (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>
              Open posts can be accepted by any other signed-in OpenMD user.
            </p>
          )}

          {isCreator && post.status !== 'closed' && hasPermission(currentUserRole, 'manage_bookings') && (
            <form action={closeMarketplacePost}>
              <input type="hidden" name="postId" value={post.id} />
              <button className="btn btn-secondary" type="submit">
                Close
              </button>
            </form>
          )}
          {!isCreator && post.claimed_by_user_id && post.claimed_by_user_id !== userId && (
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>Claimed by another user.</p>
          )}
        </div>
      </div>
    )
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Global Work Marketplace</h1>
        <p style={{ color: 'var(--muted)' }}>
          OpenMD&apos;s marketplace is a shared board across the full network. Practices and facilities can publish job or case coverage requests, and providers can publish LFW availability posts for specific dates and times so other OpenMD users can claim the opportunity.
        </p>
        <p className="section-subtitle">
          Browse active opportunities first, then expand the composer when you are ready to post.
        </p>
        {resolvedSearchParams?.error && <p style={{ color: 'var(--warning)', margin: '8px 0' }}>{resolvedSearchParams.error}</p>}
        {resolvedSearchParams?.success && <p style={{ color: 'var(--ok)', margin: '8px 0' }}>{resolvedSearchParams.success}</p>}

        <form method="get" className="calendar-filters" style={{ marginTop: 18 }}>
          <label className="calendar-filter">
            Procedure Type
            <select className="field" name="procedureType" defaultValue={selectedProcedureType}>
              <option value="">All procedure types</option>
              {procedureTypes.map((procedureType) => (
                <option key={procedureType.id} value={procedureType.label}>
                  {procedureType.label}
                </option>
              ))}
            </select>
          </label>
          <label className="calendar-filter">
            Date of Service
            <input className="field" type="date" name="serviceDate" defaultValue={selectedServiceDate} />
          </label>
          <label className="calendar-filter">
            Hospital / Location
            <select className="field" name="hospital" defaultValue={selectedHospital}>
              <option value="">All hospitals</option>
              {hospitalOptions.map((hospital) => (
                <option key={hospital} value={hospital}>
                  {hospital}
                </option>
              ))}
            </select>
          </label>
          <label className="calendar-filter">
            State
            <select className="field" name="state" defaultValue={selectedState}>
              <option value="">All states</option>
              {stateOptions.map((state) => (
                <option key={state} value={state}>
                  {state}
                </option>
              ))}
            </select>
          </label>
          <div style={{ display: 'flex', gap: 10, alignItems: 'end', flexWrap: 'wrap' }}>
            <button className="btn btn-secondary" type="submit">Apply filters</button>
            <a href="/bookings" className="btn btn-secondary">Clear</a>
          </div>
        </form>

        {hasPermission(role, 'create_marketplace_post') ? (
          <details className="marketplace-composer" style={{ marginTop: 18 }}>
            <summary className="marketplace-composer-summary">
              <span>Create a marketplace post</span>
              <span className="section-subtitle">Publish a case request or LFW availability block</span>
            </summary>
            <form action={createMarketplacePost} className="marketplace-composer-form">
              <label>
                Post Type
                <select className="field" name="postType" defaultValue="facility_request">
                  <option value="facility_request">Facility work request</option>
                  <option value="provider_offer">Provider availability post</option>
                </select>
              </label>
              <label>
                Title
                <input className="field" name="title" placeholder="Procedure title, shift title, or availability summary" required />
              </label>
              <label>
                Patient First Name
                <input className="field" name="patientFirstName" placeholder="Required for facility requests" />
              </label>
              <label>
                Patient Last Name
                <input className="field" name="patientLastName" placeholder="Required for facility requests" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Patient Address
                <input className="field" name="patientAddressLine1" placeholder="Required for facility requests" />
              </label>
              <label>
                City
                <input className="field" name="patientCity" placeholder="Required for facility requests" />
              </label>
              <label>
                State
                <input className="field" name="patientState" placeholder="Required for facility requests" />
              </label>
              <label>
                Zip
                <input className="field" name="patientZip" placeholder="Required for facility requests" />
              </label>
              <label>
                Sex
                <select className="field" name="patientSex" defaultValue="">
                  <option value="">Select sex</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label>
                Visit Type
                <select className="field" name="visitType" defaultValue="">
                  <option value="">Select visit type</option>
                  <option value="inpatient">Inpatient</option>
                  <option value="outpatient">Outpatient</option>
                </select>
              </label>
              <label>
                Procedure Type
                <select className="field" name="procedureTypeId" defaultValue="">
                  <option value="">Select procedure type</option>
                  {procedureTypes.map((procedureType) => (
                    <option key={procedureType.id} value={procedureType.id}>
                      {procedureType.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Provider
                <select className="field" name="providerId" defaultValue="">
                  <option value="">Leave unassigned / filled by claim</option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Location
                <select className="field" name="locationId" defaultValue="">
                  <option value="">Select location</option>
                  {locations.map((locationOption) => (
                    <option key={locationOption.id} value={locationOption.id}>
                      {locationOption.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Insurance Company
                <select className="field" name="insuranceCompanyId" defaultValue="">
                  <option value="">Select insurance company</option>
                  {insuranceCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Start
                <input className="field" type="datetime-local" name="startsAt" />
              </label>
              <label>
                End
                <input className="field" type="datetime-local" name="endsAt" />
              </label>
              <label style={{ gridColumn: '1 / -1' }}>
                Notes / Details
                <input className="field" name="details" placeholder="Requirements, notes, payer details, compensation, or LFW details" />
              </label>
              <div style={{ gridColumn: '1 / -1', display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
                <span className="section-subtitle" style={{ margin: 0 }}>
                  Facility requests require the full case intake set. LFW/provider posts can stay lighter. Provider remains optional for facility requests and can be filled when claimed.
                </span>
                <button className="btn btn-primary" type="submit">
                  Publish post
                </button>
              </div>
            </form>
          </details>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Your role does not permit creating marketplace posts.</p>
        )}
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Marketplace Feed</h2>
        {tenant?.name ? <p className="section-subtitle">Current workspace: {tenant.name}</p> : null}

        <h3 style={{ marginTop: 20, marginBottom: 10 }}>Available to Claim ({availableToClaimPosts.length})</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {availableToClaimPosts.length > 0 ? (
            availableToClaimPosts.map((post) => renderPost(post, role, user.id))
          ) : (
            <p style={{ color: 'var(--muted)' }}>No posts currently available to claim.</p>
          )}
        </div>

        <h3 style={{ marginTop: 20, marginBottom: 10 }}>My Posts ({myPosts.length})</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {myPosts.length > 0 ? (
            myPosts.map((post) => renderPost(post, role, user.id))
          ) : (
            <p style={{ color: 'var(--muted)' }}>You haven&apos;t published any posts yet.</p>
          )}
        </div>

        <h3 style={{ marginTop: 20, marginBottom: 10 }}>My Claimed Posts ({myClaimedPosts.length})</h3>
        <div style={{ display: 'grid', gap: 10 }}>
          {myClaimedPosts.length > 0 ? (
            myClaimedPosts.map((post) => renderPost(post, role, user.id))
          ) : (
            <p style={{ color: 'var(--muted)' }}>You haven&apos;t claimed any posts yet.</p>
          )}
        </div>
      </article>
    </section>
  )
}
