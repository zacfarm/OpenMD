export type CalendarViewMode = 'month' | 'week' | 'day'

export type CalendarEventStatus = 'pending' | 'started' | 'completed' | 'cancelled'

export type CalendarProviderOption = {
  id: string
  label: string
  specialty: string | null
}

export type ScheduleLocationOption = {
  id: string
  label: string
  addressLine1: string
  city: string
  state: string
  zip: string
}

export type ScheduleInsuranceOption = {
  id: string
  label: string
  payerCode: string | null
  addressLine1: string | null
  city: string | null
  state: string | null
  zip: string | null
  networkStatus: 'in_network' | 'out_of_network' | null
}

export type ScheduleProcedureTypeOption = {
  id: string
  label: string
}

export type ScheduleDocumentTypeOption = {
  id: string
  label: string
}

export type CalendarEventRecord = {
  id: string
  tenant_id: string
  provider_id: string | null
  billing_claim_id: string | null
  title: string
  case_identifier: string | null
  patient_display_name: string | null
  patient_first_name: string | null
  patient_last_name: string | null
  patient_address_line_1: string | null
  patient_city: string | null
  patient_state: string | null
  patient_zip: string | null
  patient_sex: 'male' | 'female' | null
  visit_type: 'inpatient' | 'outpatient' | null
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
  tenant_schedule_locations:
    | {
        id: string
        name: string
        address_line_1: string
        city: string
        state: string
        zip: string
      }
    | {
        id: string
        name: string
        address_line_1: string
        city: string
        state: string
        zip: string
      }[]
    | null
  tenant_schedule_insurance_companies:
    | {
        id: string
        name: string
        payer_code: string | null
        address_line_1: string | null
        city: string | null
        state: string | null
        zip: string | null
        network_status: 'in_network' | 'out_of_network' | null
      }
    | {
        id: string
        name: string
        payer_code: string | null
        address_line_1: string | null
        city: string | null
        state: string | null
        zip: string | null
        network_status: 'in_network' | 'out_of_network' | null
      }[]
    | null
  tenant_schedule_procedure_types:
    | {
        id: string
        name: string
      }
    | {
        id: string
        name: string
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
  patientFirstName: string | null
  patientLastName: string | null
  patientAddressLine1: string | null
  patientCity: string | null
  patientState: string | null
  patientZip: string | null
  patientSex: 'male' | 'female' | null
  visitType: 'inpatient' | 'outpatient' | null
  location: string | null
  practiceName: string | null
  facilityName: string | null
  notes: string | null
  billingClaimId: string | null
  insuranceCompany: {
    id: string
    name: string
    payerCode: string | null
    addressLine1: string | null
    city: string | null
    state: string | null
    zip: string | null
    networkStatus: 'in_network' | 'out_of_network' | null
  } | null
  procedureType: {
    id: string
    name: string
  } | null
  locationOption: {
    id: string
    name: string
    addressLine1: string
    city: string
    state: string
    zip: string
  } | null
  provider: {
    id: string
    name: string
    specialty: string | null
  } | null
  colorToken: string | null
}

export type ScheduleCaseDTO = CalendarEventDTO & {
  tenantId: string
  providerId: string | null
  sourceLabel: 'Direct' | 'Marketplace'
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
