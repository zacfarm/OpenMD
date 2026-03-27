 
'use client'

import { useEffect, useState, useMemo, useCallback } from 'react'

import {  
  Calendar,  
  Views,  
  dateFnsLocalizer,  
} from 'react-big-calendar'

import {  
  endOfDay,  
  endOfMonth,  
  endOfWeek,  
  format,  
  getDay,  
  parse,  
  startOfDay,  
  startOfMonth,  
  startOfWeek,  
} from 'date-fns'


import { getCalendarBillingHref, getCalendarEventColor } from '@/lib/calendar'  
import type { CalendarEventDTO, CalendarProviderOption, CalendarViewMode } from '@/types/calendar'
import type { CalendarEventStatus } from '@/types/calendar';
import { EventStatusButtons } from '@/components/event-status-buttons';


const localizer = dateFnsLocalizer({  
  format,  
  parse,  
  startOfWeek,  
  getDay,  
  locales: {},  
})


type CalendarWorkspaceProps = {  
  initialEvents: CalendarEventDTO[]  
  providers: CalendarProviderOption[]  
  role: string | null  
  isProviderView: boolean  
}


type CalendarUIEvent = {  
  title: string  
  start: Date  
  end: Date  
  resource: CalendarEventDTO  
}


function getRange(date: Date, view: CalendarViewMode) {  
  if (view === 'day') {  
    return {  
      from: startOfDay(date).toISOString(),  
      to: endOfDay(date).toISOString(),  
    }  
  }

  if (view === 'week') {  
    return {  
      from: startOfWeek(date).toISOString(),  
      to: endOfWeek(date).toISOString(),  
    }  
  }

  return {  
    from: startOfMonth(date).toISOString(),  
    to: endOfMonth(date).toISOString(),  
  }  
}


function toCalendarEvents(events: CalendarEventDTO[]) {  
  return events.map(  
    (event) =>  
      ({  
        title: event.title,  
        start: new Date(event.start),  
        end: new Date(event.end),  
        resource: event,  
      }) satisfies CalendarUIEvent,  
  )  
}


function formatTimeRange(start: Date, end: Date) {  
  return `${format(start, 'p')} - ${format(end, 'p')}`  
}

function formatStatus(status: CalendarEventStatus): string { 
  if (!status) return ''; 
  return status  
    .replace(/_/g, ' ')  
    .split(' ')  
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))  
    .join(' ');  
}

export default function CalendarWorkspace({  
  initialEvents,  
  providers,  
  role,  
  isProviderView,  
}: CalendarWorkspaceProps) {  
  const [events, setEvents] = useState<CalendarEventDTO[]>(initialEvents)  
  const [selectedEvent, setSelectedEvent] = useState<CalendarEventDTO | null>(null)  
  const [currentDate, setCurrentDate] = useState(new Date())  
  const [currentView, setCurrentView] = useState<CalendarViewMode>('month')  
  const [providerId, setProviderId] = useState('')  
  const [filterStatus, setFilterStatus] = useState<'' | CalendarEventStatus>('');  
  const [practice, setPractice] = useState('')  
  const [facility, setFacility] = useState('')  
  const [loading, setLoading] = useState(false)  
  const [refreshKey, setRefreshKey] = useState(0);
 
  const loadEvents = useCallback(async () => {  
    setLoading(true);  
    const controller = new AbortController(); 
    const range = getRange(currentDate, currentView);  
    const params = new URLSearchParams({  
      from: range.from,  
      to: range.to,  
    });

    if (!isProviderView && providerId) params.set('providerId', providerId);  
    if (filterStatus) params.set('status', filterStatus);  
    if (practice) params.set('practice', practice);  
    if (facility) params.set('facility', facility);

    try {  
      const response = await fetch(`/api/calendar/events?${params.toString()}`, {  
        signal: controller.signal,  
        cache: 'no-store',  
      });

      if (!response.ok) {  
        console.error('Failed to fetch events:', response.statusText);  
        return;  
      }

      const payload = (await response.json()) as { events: CalendarEventDTO[] };  
      setEvents(payload.events);  
    } catch (error) {  
      if (error instanceof DOMException && error.name === 'AbortError') {  
        // Fetch was intentionally aborted  
        return;  
      }  
      console.error('Error loading events:', error);  
    } finally {  
      setLoading(false);  
    }

     
    return controller;

  }, [  
    currentDate,  
    currentView,  
    facility,  
    isProviderView,  
    practice,  
    providerId,  
    filterStatus,  
    refreshKey, 
    setLoading, 
    setEvents, 
    getRange  
  ]);

  
  useEffect(() => {  
    const controllerPromise = loadEvents(); 
    let currentController: AbortController | null = null;

    controllerPromise.then(controller => {  
        if (controller) {  
            currentController = controller;  
        }  
    }).catch(err => {  
        console.error("Error during initial loadEvents call:", err);  
    });

    return () => {   
      if (currentController) {  
          currentController.abort();  
      }  
    };  
  }, [loadEvents]);


  const calendarEvents = useMemo(() => toCalendarEvents(events), [events]);

  const handleEventStatusUpdated = (updatedEvent: CalendarEventDTO) => {  
    setSelectedEvent(updatedEvent);  
    setRefreshKey(prev => prev + 1);  
  };

  return (  
    <article className="card" style={{ padding: 18 }}>  
      <div className="section-head">  
        <div>  
          <h2 style={{ margin: 0 }}>Schedule workspace</h2>  
          <p className="section-subtitle">  
            {isProviderView  
              ? 'Month, week, and day views for your own assigned work.'  
              : `Operational calendar for ${role ?? 'your role'} with provider, status, and facility filters.`}  
          </p>  
        </div>  
        {loading && <div className="eyebrow">Refreshing events</div>}  
      </div>

      <div className="calendar-filters">  
        {!isProviderView && (  
          <label className="calendar-filter">  
            Provider  
            <select className="field" value={providerId} onChange={(event) => setProviderId(event.target.value)}>  
              <option value="">All providers</option>  
              {providers.map((provider) => (  
                <option key={provider.id} value={provider.id}>  
                  {provider.label}  
                </option>  
              ))}  
            </select>  
          </label>  
        )}

        <label className="calendar-filter">  
          Status  
          <select className="field" value={filterStatus} onChange={(event) => setFilterStatus(event.target.value as typeof filterStatus)}>  
            <option value="">All statuses</option>  
            <option value="pending">Pending</option>  
            <option value="started">Started</option>  
            <option value="completed">Completed</option>  
            <option value="cancelled">Cancelled</option>  
          </select>  
        </label>


        <label className="calendar-filter">  
          Practice  
          <input className="field" value={practice} onChange={(event) => setPractice(event.target.value)} placeholder="Practice name" />  
        </label>


        <label className="calendar-filter">  
          Facility  
          <input className="field" value={facility} onChange={(event) => setFacility(event.target.value)} placeholder="Facility name" />  
        </label>  
      </div>


      <div className="calendar-summary">  
        <div>  
          <strong>{events.length}</strong> cases in view  
        </div>  
        <div>{isProviderView ? 'Your assigned work only' : 'Provider, status, and organization filters applied live'}</div>  
      </div>


      <div className="calendar-shell">  
        <Calendar  
          localizer={localizer}  
          events={calendarEvents}  
          date={currentDate}  
          view={currentView}  
          views={[Views.MONTH, Views.WEEK, Views.DAY]}  
          onNavigate={(date: Date) => setCurrentDate(date)}  
          onView={(view: CalendarViewMode) => setCurrentView(view)}  
          startAccessor="start"  
          endAccessor="end"  
          tooltipAccessor={null}  
          popup  
          selectable={false}  
          eventPropGetter={(event: CalendarUIEvent) => {  
            const background = getCalendarEventColor(event.resource)  
            return {  
              style: {  
                backgroundColor: background,  
                borderColor: background,  
                color: '#fff',  
                borderRadius: 10,  
              },  
            }  
          }}  
          onSelectEvent={(event: CalendarUIEvent) => setSelectedEvent(event.resource)}  
        />  
      </div>


      {selectedEvent && (  
        <div className="calendar-modal-backdrop" onClick={() => setSelectedEvent(null)} role="presentation">  
          <div className="calendar-modal card" onClick={(event) => event.stopPropagation()} role="dialog" aria-modal="true">  
            <div className="section-head">  
              <div>  
                <h3 style={{ margin: 0 }}>{selectedEvent.patientDisplayName || selectedEvent.title}</h3>  
                <p className="section-subtitle">  
                  {selectedEvent.caseType || 'Case'} · <span className="capitalize">{selectedEvent.status.replace(/_/g, ' ')}</span>  
                </p>  
              </div>  
              <button type="button" className="btn btn-secondary" onClick={() => setSelectedEvent(null)}>  
                Close  
              </button>  
            </div>


            <div className="calendar-detail-grid">  
              <div>  
                <p className="calendar-detail-label">Date</p>  
                <p>{format(new Date(selectedEvent.start), 'PPP')}</p>  
              </div>  
              <div>  
                <p className="calendar-detail-label">Time</p>  
                <p>  
                  {formatTimeRange(new Date(selectedEvent.start), new Date(selectedEvent.end))}  
                </p>  
              </div>  
              <div>  
                <p className="calendar-detail-label">Provider</p>  
                <p>{selectedEvent.provider?.name ?? 'Unassigned'}</p>  
              </div>  
              <div>  
                <p className="calendar-detail-label">Practice / Facility</p>  
                <p>{selectedEvent.practiceName || selectedEvent.facilityName || 'Not specified'}</p>  
              </div>  
              <div>  
                <p className="calendar-detail-label">Case identifier</p>  
                <p>{selectedEvent.caseIdentifier || 'N/A'}</p>  
              </div>  
              <div>  
                <p className="calendar-detail-label">Patient / case</p>  
                <p>{selectedEvent.patientDisplayName || selectedEvent.title}</p>  
              </div>  
              <div>  
                <p className="calendar-detail-label">Status</p>  
                <p className="capitalize">{selectedEvent.status.replace(/_/g, ' ')}</p>  
              </div>  
            </div>


            {selectedEvent.location && (  
              <div>  
                <p className="calendar-detail-label">Location</p>  
                <p style={{ marginTop: 0 }}>{selectedEvent.location}</p>  
              </div>  
            )}


            {selectedEvent.notes && (  
              <div>  
                <p className="calendar-detail-label">Notes</p>  
                <p style={{ marginTop: 0 }}>{selectedEvent.notes}</p>  
              </div>  
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}></div>

            <div className="mt-6 mb-4">  
                <h4 className="text-md font-medium mb-2">Change Status:</h4>  
                <EventStatusButtons  
                    eventId={selectedEvent.id}  
                    currentStatus={selectedEvent.status}  
                    onStatusUpdated={handleEventStatusUpdated}  
                />  
            </div>


            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>  
              <a className="btn btn-primary" href={getCalendarBillingHref(selectedEvent)}>  
                Go to Billing  
              </a>  
              {selectedEvent.billingClaimId && (  
                `Linked claim: ${selectedEvent.billingClaimId.slice(0, 8)}`  
              )}  
            </div>  
          </div>  
        </div>  
      )}  
    </article>  
  )  
} 