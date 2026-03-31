import { NextResponse } from 'next/server'

import { getCalendarAccessContext, getScheduleCases } from '@/lib/calendar'
import { normalizeTenantRole } from '@/lib/rbac'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

function canCreateScheduleEvent(role: string | null | undefined) {
  const normalizedRole = normalizeTenantRole(role)
  return (
    normalizedRole === 'admin' ||
    normalizedRole === 'facility_manager' ||
    normalizedRole === 'credentialing' ||
    normalizedRole === 'doctor'
  )
}

function buildCaseIdentifier() {
  return `CASE-${Date.now().toString().slice(-8)}`
}

export async function GET(req: Request) {
  const supabase = await createSupabaseServerClient()
  const access = await getCalendarAccessContext(supabase)

  if (!access) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const cases = await getScheduleCases(supabase, access, {
    providerId: searchParams.get('providerId') || undefined,
    status: searchParams.get('status') || undefined,
    from: searchParams.get('from') || undefined,
    to: searchParams.get('to') || undefined,
  })

  return NextResponse.json({ cases })
}

export async function POST(req: Request) {
  try {
    const supabase = await createSupabaseServerClient()
    const access = await getCalendarAccessContext(supabase)

    if (!access?.tenantId || !canCreateScheduleEvent(access.role)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const body = (await req.json()) as {
      patientFirstName?: string
      patientLastName?: string
      patientAddressLine1?: string
      patientCity?: string
      patientState?: string
      patientZip?: string
      patientSex?: 'male' | 'female'
      visitType?: 'inpatient' | 'outpatient'
      title?: string
      providerId?: string
      serviceDate?: string
      startTime?: string
      endTime?: string
      locationId?: string
      insuranceCompanyId?: string
      procedureTypeId?: string
      notes?: string
      status?: string
    }

    const patientFirstName = body.patientFirstName?.trim() || ''
    const patientLastName = body.patientLastName?.trim() || ''
    const patientAddressLine1 = body.patientAddressLine1?.trim() || ''
    const patientCity = body.patientCity?.trim() || ''
    const patientState = body.patientState?.trim() || ''
    const patientZip = body.patientZip?.trim() || ''
    const providerId = body.providerId?.trim() || ''
    const serviceDate = body.serviceDate?.trim() || ''
    const startTime = body.startTime?.trim() || ''
    const endTime = body.endTime?.trim() || ''
    const locationId = body.locationId?.trim() || ''
    const insuranceCompanyId = body.insuranceCompanyId?.trim() || ''
    const procedureTypeId = body.procedureTypeId?.trim() || ''

    if (!patientFirstName || !patientLastName || !patientAddressLine1 || !patientCity || !patientState || !patientZip || !serviceDate || !startTime || !endTime || !locationId || !insuranceCompanyId || !procedureTypeId || !body.patientSex || !body.visitType) {
      return NextResponse.json({ error: 'Patient details, sex, visit type, insurance company, procedure type, location, date, start time, and end time are required.' }, { status: 400 })
    }

    const startsAt = new Date(`${serviceDate}T${startTime}`)
    const endsAt = new Date(`${serviceDate}T${endTime}`)

    if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
      return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 })
    }

    let provider: { id: string; user_id: string | null; practice_tenant_id: string | null } | null = null
    if (providerId) {
      const { data: providerRow } = await supabase
        .from('provider_profiles')
        .select('id,user_id,practice_tenant_id')
        .eq('id', providerId)
        .maybeSingle()
      provider = providerRow as { id: string; user_id: string | null; practice_tenant_id: string | null } | null

      if (!provider || provider.practice_tenant_id !== access.tenantId) {
        return NextResponse.json({ error: 'Selected provider is not part of this workspace.' }, { status: 400 })
      }
    }

    if (access.isProviderView && providerId && !access.providerIds.includes(providerId)) {
      return NextResponse.json({ error: 'Providers can only create cases for themselves.' }, { status: 403 })
    }

    const { data: locationRow } = await supabase
      .from('tenant_schedule_locations')
      .select('id,tenant_id,name,address_line_1,city,state,zip')
      .eq('id', locationId)
      .maybeSingle()
    const location = locationRow as { id: string; tenant_id: string; name: string; address_line_1: string; city: string; state: string; zip: string } | null

    if (!location || location.tenant_id !== access.tenantId) {
      return NextResponse.json({ error: 'Selected location is not part of this workspace.' }, { status: 400 })
    }

    const { data: insuranceRow } = await supabase
      .from('tenant_schedule_insurance_companies')
      .select('id,tenant_id,name,payer_code')
      .eq('id', insuranceCompanyId)
      .maybeSingle()
    const insuranceCompany = insuranceRow as { id: string; tenant_id: string; name: string; payer_code: string | null } | null

    if (!insuranceCompany || insuranceCompany.tenant_id !== access.tenantId) {
      return NextResponse.json({ error: 'Selected insurance company is not part of this workspace.' }, { status: 400 })
    }

    const { data: procedureTypeRow } = await supabase
      .from('tenant_schedule_procedure_types')
      .select('id,tenant_id,name')
      .eq('id', procedureTypeId)
      .maybeSingle()
    const procedureType = procedureTypeRow as { id: string; tenant_id: string; name: string } | null

    if (!procedureType || procedureType.tenant_id !== access.tenantId) {
      return NextResponse.json({ error: 'Selected procedure type is not part of this workspace.' }, { status: 400 })
    }

    const patientDisplayName = `${patientLastName}, ${patientFirstName}`

    const { error } = await supabase.from('schedule_events').insert({
      tenant_id: access.tenantId,
      provider_id: provider?.id ?? null,
      title: body.title?.trim() || patientDisplayName,
      patient_display_name: patientDisplayName,
      patient_first_name: patientFirstName,
      patient_last_name: patientLastName,
      patient_address_line_1: patientAddressLine1,
      patient_city: patientCity,
      patient_state: patientState,
      patient_zip: patientZip,
      patient_sex: body.patientSex,
      visit_type: body.visitType,
      case_identifier: buildCaseIdentifier(),
      procedure_type_id: procedureType.id,
      case_type: procedureType.name,
      status: body.status?.trim() || 'scheduled',
      starts_at: startsAt.toISOString(),
      ends_at: endsAt.toISOString(),
      location_id: location.id,
      location: `${location.name} · ${location.address_line_1}, ${location.city}, ${location.state} ${location.zip}`,
      insurance_company_id: insuranceCompany.id,
      practice_name: access.tenantOrgType === 'practice' ? access.tenantName : null,
      facility_name: access.tenantOrgType === 'facility' ? access.tenantName : null,
      notes: body.notes?.trim() || null,
      metadata: { source: 'direct_schedule' },
      created_by: access.userId,
      updated_by: access.userId,
    } as never)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to create scheduled case.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
