'use client'

import { useEffect, useState } from 'react'
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

function CalendarEventTile({ event }: { event: CalendarUIEvent }) {
  const patientOrTitle = event.resource.patientDisplayName || event.title
  const orgLabel = event.resource.practiceName || event.resource.facilityName

  return (
    <div className="calendar-event-tile">
      <div className="calendar-event-kicker">
        <span>{formatTimeRange(event.start, event.end)}</span>
        {event.resource.caseIdentifier && <span>Case {event.resource.caseIdentifier}</span>}
      </div>
      <strong>{patientOrTitle}</strong>
      {event.resource.caseType && <span>{event.resource.caseType}</span>}
      {event.resource.provider?.name && <span>{event.resource.provider.name}</span>}
      {orgLabel && <span>{orgLabel}</span>}
    </div>
  )
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
  const [status, setStatus] = useState('')
  const [practice, setPractice] = useState('')
  const [facility, setFacility] = useState('')
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    const range = getRange(currentDate, currentView)
    const params = new URLSearchParams({
      from: range.from,
      to: range.to,
    })

    if (!isProviderView && providerId) params.set('providerId', providerId)
    if (status) params.set('status', status)
    if (practice) params.set('practice', practice)
    if (facility) params.set('facility', facility)

    async function loadEvents() {
      setLoading(true)
      try {
        const response = await fetch(`/api/calendar/events?${params.toString()}`, {
          signal: controller.signal,
          cache: 'no-store',
        })

        if (!response.ok) return
        const payload = (await response.json()) as { events: CalendarEventDTO[] }
        setEvents(payload.events)
      } catch (error) {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        throw error
      } finally {
        setLoading(false)
      }
    }

    void loadEvents()

    return () => controller.abort()
  }, [currentDate, currentView, facility, isProviderView, practice, providerId, status])

  const calendarEvents = toCalendarEvents(events)
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
          <select className="field" value={status} onChange={(event) => setStatus(event.target.value)}>
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In progress</option>
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
          components={{ event: CalendarEventTile }}
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
                  {selectedEvent.caseType || 'Case'} · {selectedEvent.status.replace(/_/g, ' ')}
                </p>
              </div>
              <button className="btn btn-secondary" type="button" onClick={() => setSelectedEvent(null)}>
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
                <p>{selectedEvent.status.replace(/_/g, ' ')}</p>
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

            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
              <a className="btn btn-primary" href={getCalendarBillingHref(selectedEvent)}>
                Go to Billing
              </a>
              {selectedEvent.billingClaimId && (
                <span className="eyebrow">Linked claim: {selectedEvent.billingClaimId.slice(0, 8)}</span>
              )}
            </div>
          </div>
        </div>
      )}
    </article>
  )
}
