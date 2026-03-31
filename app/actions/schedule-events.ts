// schedule-events.ts  
'use server';  
import { revalidatePath } from 'next/cache';  
import { createSupabaseServerClient } from '@/lib/supabaseServer';  
import { CalendarEventStatus, CalendarEventDTO } from '@/types/calendar';
import { createScheduleEvent, transformScheduleEventToDTO } from '@/lib/supabase/schedule-events'; 

export type CreateEventFormInput = {  
  title: string;  
  providerId: string;  
  startsAt: string;
  endsAt: string;   // ISO string for datetime-local  
  location?: string | null;  
  caseType?: string | null;  
  caseIdentifier?: string | null;
  patientDisplayName?: string | null;  
  notes?: string | null;  
  colorToken?: string | null;  
  billingClaimId?: string | null;  
};

 
export async function createEventAction(input: CreateEventFormInput) {  
  const supabase = await createSupabaseServerClient();    
  const { data: { user }, error: userError } = await supabase.auth.getUser();  
  if (userError || !user) {  
    return { success: false, error: 'Authentication required to create event.' };  
  }

  const { data: membership, error: membershipError } = await supabase  
    .from('tenant_memberships')  
    .select('tenant_id')  
    .eq('user_id', user.id)  
    .limit(1)  
    .maybeSingle();

  if (membershipError || !membership?.tenant_id) {  
    return { success: false, error: 'User does not belong to a tenant or tenant ID not found.' };  
  }

  
  const newEventData = {  
    tenant_id: membership.tenant_id,  
    provider_id: input.providerId,  
    title: input.title,  
    starts_at: input.startsAt,  
    ends_at: input.endsAt,  
    location: input.location || null,  
    case_type: input.caseType || null,  
    case_identifier: input.caseIdentifier || null,  
    patient_display_name: input.patientDisplayName || null,  
    notes: input.notes || null,  
    color_token: input.colorToken || null,  
    billing_claim_id: input.billingClaimId || null,  
    event_status: 'pending' as CalendarEventStatus,  
    created_by: user.id,  
    updated_by: user.id,   
  };
 
  try {  
    const createdEvent = await createScheduleEvent(newEventData);  
    if (createdEvent) {    
      revalidatePath('/dashboard/calendar'); 
      return { success: true, event: createdEvent as CalendarEventDTO };  
    }  
    return { success: false, error: 'Failed to create event in database.' };  
  } catch (e: any) {  
    console.error('Error creating event:', e);  
    return { success: false, error: `Error creating event: ${e.message || 'Unknown error'}` };  
  }  
}

 
export async function updateEventStatusAction(  
  eventId: string,  
  newStatus: CalendarEventStatus  
) {  
  try {  
    const supabase = await createSupabaseServerClient();  
    const { data: updatedEvent, error } = await supabase  
      .from('schedule_events')  
      .update({ event_status: newStatus, updated_at: new Date().toISOString() })  
      .eq('id', eventId)  
      .select(`  
        id, tenant_id, provider_id, billing_claim_id, title, starts_at, ends_at, location,  
        practice_name, facility_name, notes, metadata, created_at, updated_at,  
        created_by, updated_by, case_identifier, case_type,  
        status, event_status, color_token, patient_display_name,  
        provider_profiles ( id, display_name, specialty )  
      `)  
      .single();

    if (error) {  
      console.error('Error in updateEventStatusAction:', error);  
      return { success: false, error: error.message };  
    }  
    if (!updatedEvent) {  
      return { success: false, error: 'Event not found or not updated.' };  
    }

    console.log(`Event ${eventId} status updated to: ${newStatus}`);

 
    revalidatePath('/dashboard/calendar');  
    revalidatePath(`/dashboard/calendar/${eventId}`);
  
    return { success: true, event: transformScheduleEventToDTO(updatedEvent as any) };  
  } catch (error: any) {  
    console.error('Server Action Error:', error.message);  
    return { success: false, error: error.message };  
  }  
}  