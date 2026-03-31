import { revalidatePath } from 'next/cache'
import Link from 'next/link'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { normalizeTenantRole } from '@/lib/rbac'
import { DEFAULT_SCHEDULE_DOCUMENT_TYPES } from '@/lib/scheduling'

function canManageScheduling(role: string | null | undefined) {
  const normalizedRole = normalizeTenantRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'facility_manager' || normalizedRole === 'credentialing'
}

async function addLocation(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !canManageScheduling(membership.role)) {
    redirect('/dashboard')
  }

  const name = String(formData.get('name') || '').trim()
  const addressLine1 = String(formData.get('addressLine1') || '').trim()
  const city = String(formData.get('city') || '').trim()
  const state = String(formData.get('state') || '').trim()
  const zip = String(formData.get('zip') || '').trim()

  if (!name || !addressLine1 || !city || !state || !zip) {
    redirect('/scheduling/manage?error=All location fields are required.')
  }

  const { error } = await supabase.from('tenant_schedule_locations').insert({
    tenant_id: membership.tenant_id,
    name,
    address_line_1: addressLine1,
    city,
    state,
    zip,
    created_by: user.id,
  })

  if (error) {
    redirect(`/scheduling/manage?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/scheduling/manage')
  revalidatePath('/schedule-cases')
  redirect('/scheduling/manage?success=Location added.')
}

async function addInsuranceCompany(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !canManageScheduling(membership.role)) {
    redirect('/dashboard')
  }

  const name = String(formData.get('name') || '').trim()
  const payerCode = String(formData.get('payerCode') || '').trim() || null
  const addressLine1 = String(formData.get('addressLine1') || '').trim()
  const city = String(formData.get('city') || '').trim()
  const state = String(formData.get('state') || '').trim()
  const zip = String(formData.get('zip') || '').trim()
  const networkStatus = String(formData.get('networkStatus') || '').trim()

  if (!name || !addressLine1 || !city || !state || !zip || !['in_network', 'out_of_network'].includes(networkStatus)) {
    redirect('/scheduling/manage?error=All insurance company fields are required.')
  }

  const { error } = await supabase.from('tenant_schedule_insurance_companies').insert({
    tenant_id: membership.tenant_id,
    name,
    payer_code: payerCode,
    address_line_1: addressLine1,
    city,
    state,
    zip,
    network_status: networkStatus,
    created_by: user.id,
  })

  if (error) {
    redirect(`/scheduling/manage?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/scheduling/manage')
  revalidatePath('/schedule-cases')
  redirect('/scheduling/manage?success=Insurance company added.')
}

async function addProcedureType(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !canManageScheduling(membership.role)) {
    redirect('/dashboard')
  }

  const name = String(formData.get('name') || '').trim()

  if (!name) {
    redirect('/scheduling/manage?error=Procedure type name is required.')
  }

  const { data: existingProcedureType } = await supabase
    .from('tenant_schedule_procedure_types')
    .select('id')
    .eq('tenant_id', membership.tenant_id)
    .ilike('name', name)
    .maybeSingle()

  if (existingProcedureType) {
    redirect('/scheduling/manage?error=That procedure type already exists for this workspace.')
  }

  const { error } = await supabase.from('tenant_schedule_procedure_types').insert({
    tenant_id: membership.tenant_id,
    name,
    created_by: user.id,
  })

  if (error) {
    if (error.code === '23505') {
      redirect('/scheduling/manage?error=That procedure type already exists for this workspace.')
    }
    redirect(`/scheduling/manage?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/scheduling/manage')
  revalidatePath('/schedule-cases')
  redirect('/scheduling/manage?success=Procedure type added.')
}

async function addDocumentType(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !canManageScheduling(membership.role)) {
    redirect('/dashboard')
  }

  const name = String(formData.get('name') || '').trim()

  if (!name) {
    redirect('/scheduling/manage?error=Document type name is required.')
  }

  if (DEFAULT_SCHEDULE_DOCUMENT_TYPES.some((type) => type.toLowerCase() === name.toLowerCase())) {
    redirect('/scheduling/manage?error=That document type already exists as a default option.')
  }

  const { data: existingDocumentType } = await supabase
    .from('tenant_schedule_document_types')
    .select('id')
    .eq('tenant_id', membership.tenant_id)
    .ilike('name', name)
    .maybeSingle()

  if (existingDocumentType) {
    redirect('/scheduling/manage?error=That document type already exists for this workspace.')
  }

  const { error } = await supabase.from('tenant_schedule_document_types').insert({
    tenant_id: membership.tenant_id,
    name,
    created_by: user.id,
  })

  if (error) {
    if (error.code === '23505') {
      redirect('/scheduling/manage?error=That document type already exists for this workspace.')
    }
    redirect(`/scheduling/manage?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/scheduling/manage')
  revalidatePath('/schedule-cases')
  redirect('/scheduling/manage?success=Document type added.')
}

export default async function SchedulingManagePage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !canManageScheduling(membership.role)) {
    redirect('/dashboard')
  }

  const tenant = Array.isArray(membership.tenants) ? membership.tenants[0] : membership.tenants

  const [{ data: locations }, { data: insuranceCompanies }, { data: procedureTypes }, { data: customDocumentTypes }] = await Promise.all([
    supabase
      .from('tenant_schedule_locations')
      .select('id,name,address_line_1,city,state,zip,is_active')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tenant_schedule_insurance_companies')
      .select('id,name,payer_code,address_line_1,city,state,zip,network_status,is_active')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tenant_schedule_procedure_types')
      .select('id,name,is_active')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false }),
    supabase
      .from('tenant_schedule_document_types')
      .select('id,name,is_active')
      .eq('tenant_id', membership.tenant_id)
      .order('created_at', { ascending: false }),
  ])

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 20 }}>
        <div className="section-head">
          <div>
            <h1 style={{ marginTop: 0 }}>Scheduling Manage</h1>
            <p className="section-subtitle">Manage locations, insurance companies, procedure types, and document types for {tenant?.name ?? 'this workspace'}.</p>
          </div>
          <Link href="/schedule-cases" className="btn btn-secondary">Back to Schedule Cases</Link>
        </div>
        {resolvedSearchParams?.error && <p style={{ color: 'var(--warning)', margin: '8px 0 0' }}>{resolvedSearchParams.error}</p>}
        {resolvedSearchParams?.success && <p style={{ color: 'var(--ok)', margin: '8px 0 0' }}>{resolvedSearchParams.success}</p>}
      </article>

      <article className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Locations</h2>
        <form action={addLocation} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1.2fr 1.8fr 1fr 1fr 1fr auto' }}>
          <input className="field" name="name" placeholder="Location name" required />
          <input className="field" name="addressLine1" placeholder="Street address" required />
          <input className="field" name="city" placeholder="City" required />
          <input className="field" name="state" placeholder="State" required />
          <input className="field" name="zip" placeholder="Zip" required />
          <button className="btn btn-primary" type="submit">Add location</button>
        </form>

        <div className="dashboard-case-table" style={{ marginTop: 14 }}>
          {locations?.length ? locations.map((location) => (
            <article key={location.id} className="dashboard-case-row">
              <div className="dashboard-case-primary">
                <strong>{location.name}</strong>
                <span>{location.address_line_1}</span>
                <span>{location.city}, {location.state} {location.zip}</span>
              </div>
              <div><span className="dashboard-case-status">{location.is_active ? 'active' : 'inactive'}</span></div>
              <div className="dashboard-case-meta"><strong>Type</strong><span>Facility / office</span></div>
              <div className="dashboard-case-meta"><strong>Workspace</strong><span>{tenant?.name ?? 'Current workspace'}</span></div>
              <div className="dashboard-case-meta"><strong>Use</strong><span>Create-case dropdown</span></div>
              <div className="dashboard-case-actions" />
            </article>
          )) : (
            <div className="dashboard-case-empty">No locations added yet.</div>
          )}
        </div>
      </article>

      <article className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Insurance Companies</h2>
        <form action={addInsuranceCompany} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1.4fr 1fr 1.8fr 1fr 1fr 1fr 1fr auto' }}>
          <input className="field" name="name" placeholder="Insurance company name" required />
          <input className="field" name="payerCode" placeholder="Optional payer code" />
          <input className="field" name="addressLine1" placeholder="Street address" required />
          <input className="field" name="city" placeholder="City" required />
          <input className="field" name="state" placeholder="State" required />
          <input className="field" name="zip" placeholder="Zip" required />
          <select className="field" name="networkStatus" defaultValue="in_network" required>
            <option value="in_network">In Network</option>
            <option value="out_of_network">Out-of-Network</option>
          </select>
          <button className="btn btn-primary" type="submit">Add insurance</button>
        </form>

        <div className="dashboard-case-table" style={{ marginTop: 14 }}>
          {insuranceCompanies?.length ? insuranceCompanies.map((company) => (
            <article key={company.id} className="dashboard-case-row">
              <div className="dashboard-case-primary">
                <strong>{company.name}</strong>
                <span>{company.payer_code || 'No payer code'}</span>
                <span>{company.address_line_1}</span>
                <span>{company.city}, {company.state} {company.zip}</span>
              </div>
              <div><span className="dashboard-case-status">{company.is_active ? 'active' : 'inactive'}</span></div>
              <div className="dashboard-case-meta"><strong>Workspace</strong><span>{tenant?.name ?? 'Current workspace'}</span></div>
              <div className="dashboard-case-meta"><strong>Network Status</strong><span>{company.network_status === 'out_of_network' ? 'Out-of-Network' : 'In Network'}</span></div>
              <div className="dashboard-case-meta"><strong>Use</strong><span>Create-case dropdown</span></div>
              <div className="dashboard-case-actions" />
            </article>
          )) : (
            <div className="dashboard-case-empty">No insurance companies added yet.</div>
          )}
        </div>
      </article>

      <article className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Procedure Types</h2>
        <form action={addProcedureType} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto' }}>
          <input className="field" name="name" placeholder="Procedure type name" required />
          <button className="btn btn-primary" type="submit">Add procedure type</button>
        </form>

        <div className="dashboard-case-table" style={{ marginTop: 14 }}>
          {procedureTypes?.length ? procedureTypes.map((procedureType) => (
            <article key={procedureType.id} className="dashboard-case-row">
              <div className="dashboard-case-primary">
                <strong>{procedureType.name}</strong>
                <span>Managed dropdown option for Schedule Cases</span>
              </div>
              <div><span className="dashboard-case-status">{procedureType.is_active ? 'active' : 'inactive'}</span></div>
              <div className="dashboard-case-meta"><strong>Workspace</strong><span>{tenant?.name ?? 'Current workspace'}</span></div>
              <div className="dashboard-case-meta"><strong>Use</strong><span>Procedure Type dropdown</span></div>
              <div className="dashboard-case-meta"><strong>Format</strong><span>Text option set</span></div>
              <div className="dashboard-case-actions" />
            </article>
          )) : (
            <div className="dashboard-case-empty">No procedure types added yet.</div>
          )}
        </div>
      </article>

      <article className="card" style={{ padding: 20 }}>
        <h2 style={{ marginTop: 0 }}>Document Types</h2>
        <p className="section-subtitle" style={{ marginTop: 0 }}>
          Default options are always available. Add custom document type labels for your workspace here.
        </p>
        <form action={addDocumentType} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr auto' }}>
          <input className="field" name="name" placeholder="Custom document type name" required />
          <button className="btn btn-primary" type="submit">Add document type</button>
        </form>

        <div className="dashboard-case-table" style={{ marginTop: 14 }}>
          {DEFAULT_SCHEDULE_DOCUMENT_TYPES.map((documentType) => (
            <article key={documentType} className="dashboard-case-row">
              <div className="dashboard-case-primary">
                <strong>{documentType}</strong>
                <span>Default document option</span>
              </div>
              <div><span className="dashboard-case-status">default</span></div>
              <div className="dashboard-case-meta"><strong>Workspace</strong><span>All workspaces</span></div>
              <div className="dashboard-case-meta"><strong>Use</strong><span>Documents upload dropdown</span></div>
              <div className="dashboard-case-meta"><strong>Type</strong><span>System option</span></div>
              <div className="dashboard-case-actions" />
            </article>
          ))}

          {customDocumentTypes?.length ? customDocumentTypes.map((documentType) => (
            <article key={documentType.id} className="dashboard-case-row">
              <div className="dashboard-case-primary">
                <strong>{documentType.name}</strong>
                <span>Custom workspace document option</span>
              </div>
              <div><span className="dashboard-case-status">{documentType.is_active ? 'active' : 'inactive'}</span></div>
              <div className="dashboard-case-meta"><strong>Workspace</strong><span>{tenant?.name ?? 'Current workspace'}</span></div>
              <div className="dashboard-case-meta"><strong>Use</strong><span>Documents upload dropdown</span></div>
              <div className="dashboard-case-meta"><strong>Type</strong><span>Custom option</span></div>
              <div className="dashboard-case-actions" />
            </article>
          )) : null}
        </div>
      </article>
    </section>
  )
}
