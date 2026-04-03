import { NextResponse } from 'next/server'

import { getCalendarAccessContext } from '@/lib/calendar'
import { normalizeTenantRole } from '@/lib/rbac'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

function canManageAllScheduleEvents(role: string | null | undefined) {
  const normalizedRole = normalizeTenantRole(role)
  return normalizedRole === 'admin' || normalizedRole === 'facility_manager' || normalizedRole === 'credentialing'
}

function canEditOwnScheduleEvents(role: string | null | undefined) {
  const normalizedRole = normalizeTenantRole(role)
  return normalizedRole === 'doctor'
}

export async function PATCH(req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params
    const supabase = await createSupabaseServerClient()
    const access = await getCalendarAccessContext(supabase)

    if (!access?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existingRow } = await supabase
      .from('schedule_events')
      .select('id,tenant_id,provider_id,created_by,title,starts_at,ends_at,location,notes,case_type,metadata')
      .eq('id', resolvedParams.id)
      .maybeSingle()
    const existing = existingRow as {
      id: string
      tenant_id: string
      provider_id: string | null
      created_by: string
      title: string
      starts_at: string
      ends_at: string
      location: string | null
      notes: string | null
      case_type: string | null
      metadata: Record<string, unknown> | null
    } | null

    if (!existing || existing.tenant_id !== access.tenantId) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    const canManageAll = canManageAllScheduleEvents(access.role)
    const canEditOwn = canEditOwnScheduleEvents(access.role) && (existing.provider_id ? access.providerIds.includes(existing.provider_id) : existing.created_by === access.userId)

    if (!canManageAll && !canEditOwn) {
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

    const updates: Record<string, unknown> = {
      updated_by: access.userId,
    }

    if (canManageAll) {
      const firstName = body.patientFirstName?.trim() || ''
      const lastName = body.patientLastName?.trim() || ''
      if (body.patientFirstName !== undefined) updates.patient_first_name = firstName || null
      if (body.patientLastName !== undefined) updates.patient_last_name = lastName || null
      if (body.patientAddressLine1 !== undefined) updates.patient_address_line_1 = body.patientAddressLine1.trim() || null
      if (body.patientCity !== undefined) updates.patient_city = body.patientCity.trim() || null
      if (body.patientState !== undefined) updates.patient_state = body.patientState.trim() || null
      if (body.patientZip !== undefined) updates.patient_zip = body.patientZip.trim() || null
      if (body.patientSex !== undefined) updates.patient_sex = body.patientSex
      if (body.visitType !== undefined) updates.visit_type = body.visitType
      if (body.patientFirstName !== undefined || body.patientLastName !== undefined) {
        updates.patient_display_name = firstName && lastName ? `${lastName}, ${firstName}` : null
      }
      if (body.title !== undefined) updates.title = body.title.trim() || (firstName && lastName ? `${lastName}, ${firstName}` : null)
      if (body.providerId !== undefined) {
        if (!body.providerId) {
          updates.provider_id = null
        } else {
        const { data: providerRow } = await supabase
          .from('provider_profiles')
          .select('id,practice_tenant_id')
          .eq('id', body.providerId)
          .maybeSingle()
        const provider = providerRow as { id: string; practice_tenant_id: string | null } | null
        if (!provider || provider.practice_tenant_id !== access.tenantId) {
          return NextResponse.json({ error: 'Selected provider is not part of this workspace.' }, { status: 400 })
        }
        updates.provider_id = body.providerId
        }
      }
      if (body.locationId) {
        const { data: locationRow } = await supabase
          .from('tenant_schedule_locations')
          .select('id,tenant_id,name,address_line_1,city,state,zip')
          .eq('id', body.locationId)
          .maybeSingle()
        const location = locationRow as { id: string; tenant_id: string; name: string; address_line_1: string; city: string; state: string; zip: string } | null
        if (!location || location.tenant_id !== access.tenantId) {
          return NextResponse.json({ error: 'Selected location is not part of this workspace.' }, { status: 400 })
        }
        updates.location_id = body.locationId
        updates.location = `${location.name} · ${location.address_line_1}, ${location.city}, ${location.state} ${location.zip}`
      }
      if (body.insuranceCompanyId) {
        const { data: insuranceRow } = await supabase
          .from('tenant_schedule_insurance_companies')
          .select('id,tenant_id')
          .eq('id', body.insuranceCompanyId)
          .maybeSingle()
        const insuranceCompany = insuranceRow as { id: string; tenant_id: string } | null
        if (!insuranceCompany || insuranceCompany.tenant_id !== access.tenantId) {
          return NextResponse.json({ error: 'Selected insurance company is not part of this workspace.' }, { status: 400 })
        }
        updates.insurance_company_id = body.insuranceCompanyId
      }
      if (body.procedureTypeId) {
        const { data: procedureTypeRow } = await supabase
          .from('tenant_schedule_procedure_types')
          .select('id,tenant_id,name')
          .eq('id', body.procedureTypeId)
          .maybeSingle()
        const procedureType = procedureTypeRow as { id: string; tenant_id: string; name: string } | null
        if (!procedureType || procedureType.tenant_id !== access.tenantId) {
          return NextResponse.json({ error: 'Selected procedure type is not part of this workspace.' }, { status: 400 })
        }
        updates.procedure_type_id = body.procedureTypeId
        updates.case_type = procedureType.name
      }
    }

    if (body.notes !== undefined) updates.notes = body.notes.trim() || null
    if (body.status !== undefined) updates.status = body.status.trim() || 'scheduled'

    if (body.serviceDate && body.startTime && body.endTime) {
      const startsAt = new Date(`${body.serviceDate}T${body.startTime}`)
      const endsAt = new Date(`${body.serviceDate}T${body.endTime}`)

      if (Number.isNaN(startsAt.getTime()) || Number.isNaN(endsAt.getTime()) || endsAt <= startsAt) {
        return NextResponse.json({ error: 'End time must be after start time.' }, { status: 400 })
      }

      updates.starts_at = startsAt.toISOString()
      updates.ends_at = endsAt.toISOString()
    }

    const { error } = await supabase.from('schedule_events').update(updates as never).eq('id', resolvedParams.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const marketplacePostId = typeof existing.metadata?.marketplace_post_id === 'string' ? existing.metadata.marketplace_post_id : null
    if (marketplacePostId) {
      const nextProviderId = Object.prototype.hasOwnProperty.call(updates, 'provider_id')
        ? (updates.provider_id as string | null)
        : existing.provider_id
      const nextTitle = typeof updates.title === 'string' ? updates.title : existing.title
      const nextStartsAt = typeof updates.starts_at === 'string' ? updates.starts_at : existing.starts_at
      const nextEndsAt = typeof updates.ends_at === 'string' ? updates.ends_at : existing.ends_at
      const nextLocation = typeof updates.location === 'string' ? updates.location : existing.location
      const nextDetails = Object.prototype.hasOwnProperty.call(updates, 'notes') ? (updates.notes as string | null) : existing.notes
      const nextCaseType = typeof updates.case_type === 'string' ? updates.case_type : existing.case_type

      await supabase
        .from('marketplace_posts')
        .update({
          provider_id: nextProviderId,
          title: nextTitle,
          specialty: nextCaseType,
          location: nextLocation,
          starts_at: nextStartsAt,
          ends_at: nextEndsAt,
          details: nextDetails,
          status: nextProviderId ? 'closed' : 'open',
          claimed_by_user_id: nextProviderId ? undefined : null,
          claimed_at: nextProviderId ? undefined : null,
        })
        .eq('id', marketplacePostId)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to update scheduled case.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

export async function DELETE(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const resolvedParams = await params
    const supabase = await createSupabaseServerClient()
    const access = await getCalendarAccessContext(supabase)

    if (!access?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }

    const { data: existingRow } = await supabase
      .from('schedule_events')
      .select('id,tenant_id,provider_id,created_by,metadata')
      .eq('id', resolvedParams.id)
      .maybeSingle()
    const existing = existingRow as { id: string; tenant_id: string; provider_id: string | null; created_by: string; metadata: Record<string, unknown> | null } | null

    if (!existing || existing.tenant_id !== access.tenantId) {
      return NextResponse.json({ error: 'Case not found.' }, { status: 404 })
    }

    const canDelete = canManageAllScheduleEvents(access.role) || (canEditOwnScheduleEvents(access.role) && (existing.provider_id ? access.providerIds.includes(existing.provider_id) : existing.created_by === access.userId))

    if (!canDelete) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const { error } = await supabase.from('schedule_events').delete().eq('id', resolvedParams.id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 })
    }

    const marketplacePostId = typeof existing.metadata?.marketplace_post_id === 'string' ? existing.metadata.marketplace_post_id : null
    if (marketplacePostId) {
      await supabase.from('marketplace_posts').delete().eq('id', marketplacePostId)
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unable to delete scheduled case.'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
