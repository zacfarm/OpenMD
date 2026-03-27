export type CalendarViewMode = 'month' | 'week' | 'day'

export type CalendarEventStatus = 'pending' | 'started' | 'completed' | 'cancelled'

export type CalendarProviderOption = {
  id: string
  label: string
  specialty: string | null
}

export type CalendarEventRecord = {
  id: string
  tenant_id: string
  provider_id: string
  billing_claim_id: string | null
  title: string
  case_identifier: string | null
  patient_display_name: string | null
  case_type: string | null
  status: string | null
  event_status: CalendarEventStatus;
  starts_at: string
  ends_at: string
  location: string | null
  practice_name: string | null
  facility_name: string | null
  notes: string | null
  color_token: string | null
  metadata: Record<string, unknown>
  provider_profiles:
    | {
        id: string
        display_name: string
        specialty: string | null
      }
    | {
        id: string
        display_name: string
        specialty: string | null
      }[]
    | null
}

export type BookingRequestRecord = {
    id: string  
  requesting_tenant_id: string  
  provider_id: string  
  requested_start: string  
  requested_end: string  
  location: string | null  
  notes: string | null  
  status: 'accepted' | 'confirmed'; // Booking specific statuses  
  provider_profiles:  
    | {  
        id: string  
        display_name: string  
        specialty: string | null  
      }  
    | {  
        id: string  
        display_name: string  
        specialty: string | null  
      }[]  
    | null  
}

export type CalendarEventDTO = {
  id: string
  source: 'schedule_event' | 'booking_request' | 'marketplace_post'
  title: string
  start: string
  end: string
  status: CalendarEventStatus
  caseType: string | null
  caseIdentifier: string | null
  patientDisplayName: string | null
  location: string | null
  practiceName: string | null
  facilityName: string | null
  notes: string | null
  billingClaimId: string | null
  provider: {
    id: string
    name: string
    specialty: string | null
  } | null
  colorToken: string | null
}

export type CalendarFilters = {
  providerId?: string
  status?: CalendarEventStatus;
  practice?: string
  facility?: string
  from?: string
  to?: string
}

export type CalendarAccessContext = {
  userId: string
  tenantId: string | null
  tenantName: string | null
  tenantOrgType: string | null
  role: string | null
  normalizedRole: string | null
  isProviderView: boolean
  providerIds: string[]
}
