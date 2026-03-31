// lib/supabase/schedule-events.ts  
import { createSupabaseServerClient } from '../supabaseServer';  
import type { CalendarEventDTO, CalendarEventStatus, CalendarEventRecord } from '@/types/calendar';  
import type { Json } from '@/types/supabase';

type ScheduleEventStatus = CalendarEventStatus;

 
type SingleProviderProfile = {  
  id: string;  
  display_name: string;  
  specialty: string | null;  
};

export function transformScheduleEventToDTO(dbData: CalendarEventRecord): CalendarEventDTO {  
  let patientDisplayName: string | null = null;  
  let billingClaimId: string | null = null;

  if (dbData.metadata && typeof dbData.metadata === 'object' && !Array.isArray(dbData.metadata)) {  
    const metadataObject = dbData.metadata as Record<string, Json | undefined>;  
    if (typeof metadataObject.patient_display_name === 'string') {  
      patientDisplayName = metadataObject.patient_display_name;  
    }  
    if (typeof metadataObject.billing_claim_id === 'string') {  
      billingClaimId = metadataObject.billing_claim_id;  
    }  
  }

  let selectedProvider: SingleProviderProfile | null = null;  
  
  if (dbData.provider_profiles) {  
    if (Array.isArray(dbData.provider_profiles)) {  
      if (dbData.provider_profiles.length > 0) {  
         
        selectedProvider = dbData.provider_profiles[0];  
      }  
    } else {  
      selectedProvider = dbData.provider_profiles as SingleProviderProfile;  
    }  
  }

  return {  
    id: dbData.id,  
    source: 'schedule_event',  
    title: dbData.title ?? '',  
    start: dbData.starts_at,  
    end: dbData.ends_at,  
    status: dbData.event_status, 
    caseType: dbData.case_type ?? null,  
    caseIdentifier: dbData.case_identifier ?? null,  
    patientDisplayName: patientDisplayName,  
    location: dbData.location ?? null,  
    practiceName: dbData.practice_name ?? null,  
    facilityName: dbData.facility_name ?? null,  
    notes: dbData.notes ?? null,  
    billingClaimId: billingClaimId,  
    provider: selectedProvider ? {  
      id: selectedProvider.id,  
      name: selectedProvider.display_name,  
      specialty: selectedProvider.specialty,  
    } : null,  
    colorToken: dbData.color_token ?? null,  
  };  
}


export async function updateScheduleEventStatus(  
  eventId: string,  
  newStatus: ScheduleEventStatus,  
): Promise<CalendarEventDTO | null> {  
  const supabase = await createSupabaseServerClient();

  const { data: dbData, error } = await supabase  
    .from('schedule_events')  
    .update({ event_status: newStatus, updated_at: new Date().toISOString() })  
    .eq('id', eventId)  
    .select(`  
      id, tenant_id, provider_id, title, starts_at, ends_at, location,  
      practice_name, facility_name, notes, metadata, created_at, updated_at,  
      created_by, updated_by, case_identifier, case_type,  
      status, event_status, color_token, billing_claim_id, patient_display_name,  
      provider_profiles ( id, display_name, specialty )  
    `) 
    .single();

  if (error) {  
    console.error('Error updating schedule event status:', error);  
    throw new Error(`Failed to update event status: ${error.message}`);  
  }  
  if (!dbData) {  
    return null;  
  }

 
  return transformScheduleEventToDTO(dbData as CalendarEventRecord);  
}

type NewScheduleEventInput = {  
  tenant_id: string;  
  provider_id: string;  
  title: string;  
  starts_at: string;  
  ends_at: string;  
  location: string | null;  
  case_type: string | null;  
  case_identifier: string | null;  
  patient_display_name: string | null;  
  notes: string | null;  
  color_token: string | null;  
  billing_claim_id: string | null;  
  event_status: CalendarEventStatus;  
  created_by: string;  
  updated_by: string;    
};

export async function createScheduleEvent(input: NewScheduleEventInput): Promise<CalendarEventDTO | null> {
  const supabase = await createSupabaseServerClient();

  const { data: newEvent, error: insertError } = await supabase  
    .from('schedule_events')  
    .insert(input)  
    .select(`  
      id, tenant_id, provider_id, title, starts_at, ends_at, location,  
      practice_name, facility_name, notes, metadata, created_at, updated_at,  
      created_by, updated_by, case_identifier, case_type,  
      status, event_status, color_token, billing_claim_id, patient_display_name,  
      provider_profiles ( id, display_name, specialty )  
    `)  
    .single(); // Use .single() as we're inserting one record

  if (insertError) {  
    console.error('Error inserting new schedule event:', insertError);  
    throw new Error(`Failed to create event: ${insertError.message}`);  
  }  
  if (!newEvent) {  
    return null; // Should not happen with .single() on successful insert  
  }

  return transformScheduleEventToDTO(newEvent as CalendarEventRecord);  
}

  
export async function getScheduleEvents(filters: any): Promise<CalendarEventDTO[]> {  
    const supabase = await createSupabaseServerClient();

    let query = supabase.from('schedule_events').select(`  
      id, tenant_id, provider_id, title, starts_at, ends_at, location,  
      practice_name, facility_name, notes, metadata, created_at, updated_at,  
      created_by, updated_by, case_identifier, case_type,  
      status, event_status, color_token, billing_claim_id, patient_display_name,  
      provider_profiles ( id, display_name, specialty )  
    `);  
    if (filters.status) {  
        query = query.eq('event_status', filters.status);  
    }  
    if (filters.from) { query = query.gte('starts_at', filters.from); }  
    if (filters.to) { query = query.lte('ends_at', filters.to); }  
   

    const { data, error } = await query;

    if (error) {  
        console.error('Error fetching schedule events:', error);  
        throw new Error(`Failed to fetch events: ${error.message}`);  
    }

    if (!data) {  
        return [];  
    }  
   
    return data.map(record => transformScheduleEventToDTO(record as CalendarEventRecord));  
}  