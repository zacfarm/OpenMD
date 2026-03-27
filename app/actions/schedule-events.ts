
'use server';

import { updateScheduleEventStatus } from '@/lib/supabase/schedule-events';  
import { revalidatePath } from 'next/cache';  
import type { CalendarEventDTO } from '@/types/calendar';

export async function updateEventStatusAction(  
  eventId: string,  
  newStatus: CalendarEventDTO['status']
) {  
  try {  
    const updatedEventData = await updateScheduleEventStatus(eventId, newStatus);

    if (!updatedEventData) {  
      throw new Error('Event not found or failed to update.');  
    }

    console.log(`Event ${eventId} status updated to: ${newStatus}`);
  
    revalidatePath('/dashboard/calendar');  
    revalidatePath(`/dashboard/calendar/${eventId}`); 

    return { success: true, event: updatedEventData };  
  } catch (error: any) {  
    console.error('Server Action Error:', error.message);  
    return { success: false, error: error.message };  
  }  
}  