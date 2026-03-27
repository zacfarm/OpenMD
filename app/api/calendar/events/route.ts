  
import { NextResponse } from 'next/server';  
import { getCalendarAccessContext, getCalendarEvents } from '@/lib/calendar';  
import { createSupabaseServerClient } from '@/lib/supabaseServer';  
import type { CalendarFilters } from '@/types/calendar';

export async function GET(req: Request) {  
  const supabase = await createSupabaseServerClient();  
  const access = await getCalendarAccessContext(supabase);  
  if (!access) {  
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });  
  }

  const { searchParams } = new URL(req.url);

  
  const filters: CalendarFilters = {  
    providerId: searchParams.get('providerId') || undefined,  
    status: (searchParams.get('status') as CalendarFilters['status']) || undefined,  
    practice: searchParams.get('practice') || undefined,  
    facility: searchParams.get('facility') || undefined,  
    from: searchParams.get('from') || undefined,  
    to: searchParams.get('to') || undefined,  
  };

  const events = await getCalendarEvents(supabase, access, filters);

  return NextResponse.json({  
    role: access.normalizedRole,  
    tenantId: access.tenantId,  
    events,  
  });  
}  