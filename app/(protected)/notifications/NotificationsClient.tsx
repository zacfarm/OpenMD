'use client'

import { useEffect, useReducer, useCallback } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseBrowser'
import { isEventTypeVisibleToRoles, getRoleLabel, type TenantRole } from '@/lib/notificationRoles'

type Notification = {
  id: string
  title: string
  body: string
  type: string
  status: 'unread' | 'read'
  created_at: string
  action_url: string | null
  tenant_id: string | null
}

type State = {
  notifications: Notification[]
  activeFilter: string
}

type Action =
  | { type: 'ADD'; notification: Notification }
  | { type: 'MARK_READ'; id: string }
  | { type: 'MARK_ALL_READ' }
  | { type: 'SET_FILTER'; filter: string }

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case 'ADD':
      return {
        ...state,
        notifications: [action.notification, ...state.notifications].slice(0, 60),
      }
    case 'MARK_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) =>
          n.id === action.id ? { ...n, status: 'read' } : n
        ),
      }
    case 'MARK_ALL_READ':
      return {
        ...state,
        notifications: state.notifications.map((n) => ({ ...n, status: 'read' })),
      }
    case 'SET_FILTER':
      return { ...state, activeFilter: action.filter }
    default:
      return state
  }
}

const TYPE_GROUP: Record<string, string> = {
  booking_requested: 'bookings',
  booking_status_changed: 'bookings',
  billing_claim_submitted: 'billing',
  billing_claim_status_changed: 'billing',
  marketplace_claimed: 'marketplace',
  credential_reviewed: 'credentials',
  credential_expiring: 'credentials',
  credential_missing: 'credentials',
  credential_pending_review: 'credentials',
  invite_accepted: 'team',
  team_member_joined: 'team',
}

const FILTER_OPTIONS = [
  { value: 'all', label: 'All' },
  { value: 'bookings', label: 'Bookings' },
  { value: 'billing', label: 'Billing' },
  { value: 'credentials', label: 'Credentials' },
  { value: 'marketplace', label: 'Marketplace' },
  { value: 'team', label: 'Team' },
]

export function NotificationsClient({
  initialNotifications,
  userId,
  rolesByTenant = {},
}: {
  initialNotifications: Notification[]
  userId: string
  rolesByTenant?: Record<string, TenantRole[]>
}) {
  const [state, dispatch] = useReducer(reducer, {
    notifications: initialNotifications,
    activeFilter: 'all',
  })

  // Get all unique roles the user has across tenants
  const allRoles = new Set<TenantRole>()
  Object.values(rolesByTenant).forEach((roles) => {
    if (Array.isArray(roles)) {
      roles.forEach((r) => allRoles.add(r))
    }
  })
  const userRoles = Array.from(allRoles)

  // Subscribe to real-time inserts for this user
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()
    const channel = supabase
      .channel('notifications-realtime')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'notifications',
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          dispatch({ type: 'ADD', notification: payload.new as Notification })
          // Browser notification if permitted
          if (typeof window !== 'undefined' && 'Notification' in window && window.Notification.permission === 'granted') {
            const n = payload.new as Notification
            new window.Notification(n.title, { body: n.body })
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }, [userId])

  const handleMarkRead = useCallback(async (id: string) => {
    const supabase = createSupabaseBrowserClient()
    await supabase.from('notifications').update({ status: 'read' }).eq('id', id)
    dispatch({ type: 'MARK_READ', id })
  }, [])

  const handleMarkAllRead = useCallback(async () => {
    const unreadIds = state.notifications
      .filter((n) => n.status === 'unread')
      .map((n) => n.id)
    if (unreadIds.length === 0) return
    const supabase = createSupabaseBrowserClient()
    await supabase.from('notifications').update({ status: 'read' }).in('id', unreadIds)
    dispatch({ type: 'MARK_ALL_READ' })
  }, [state.notifications])

  const filtered = state.notifications.filter((n) => {
    // First check role-based visibility
    const tenantId = n.tenant_id
    const roleForTenant = tenantId && rolesByTenant[tenantId] ? rolesByTenant[tenantId] : userRoles
    if (!isEventTypeVisibleToRoles(n.type, roleForTenant || [])) {
      return false
    }

    // Then apply category filter
    if (state.activeFilter === 'all') return true
    return (TYPE_GROUP[n.type] ?? n.type) === state.activeFilter
  })

  const unreadCount = state.notifications.filter((n) => {
    const tenantId = n.tenant_id
    const roleForTenant = tenantId && rolesByTenant[tenantId] ? rolesByTenant[tenantId] : userRoles
    return n.status === 'unread' && isEventTypeVisibleToRoles(n.type, roleForTenant || [])
  }).length

  const unreadByGroup = (group: string) =>
    state.notifications.filter((n) => {
      if (n.status !== 'unread') return false
      if ((TYPE_GROUP[n.type] ?? n.type) !== group) return false
      const tenantId = n.tenant_id
      const roleForTenant = tenantId && rolesByTenant[tenantId] ? rolesByTenant[tenantId] : userRoles
      return isEventTypeVisibleToRoles(n.type, roleForTenant || [])
    }).length

  return (
    <section className="card" style={{ padding: 18 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <div>
          <h1 style={{ margin: 0, display: 'flex', alignItems: 'center', gap: 10 }}>
            Notification Center
            {unreadCount > 0 && (
              <span
                style={{
                  display: 'inline-block',
                  background: 'var(--accent)',
                  color: '#fff',
                  borderRadius: 99,
                  fontSize: 12,
                  padding: '2px 9px',
                }}
              >
                {unreadCount} new
              </span>
            )}
          </h1>
          {userRoles.length > 0 && (
            <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--muted)' }}>
              Viewing as: <span style={{ fontWeight: 500 }}>{userRoles.map(getRoleLabel).join(', ')}</span>
            </p>
          )}
        </div>
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <a href="/settings/notifications" style={{ fontSize: 13, color: 'var(--muted)' }}>
            Preferences
          </a>
          {unreadCount > 0 && (
            <button className="btn btn-primary" onClick={handleMarkAllRead}>
              Mark all read
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display: 'flex', gap: 6, marginBottom: 18, flexWrap: 'wrap' }}>
        {FILTER_OPTIONS.map((opt) => {
          const count = opt.value !== 'all' ? unreadByGroup(opt.value) : 0
          const active = state.activeFilter === opt.value
          return (
            <button
              key={opt.value}
              onClick={() => dispatch({ type: 'SET_FILTER', filter: opt.value })}
              className="btn btn-primary"
              style={{
                fontSize: 13,
                padding: '4px 12px',
                background: active ? 'var(--accent)' : undefined,
                color: active ? '#fff' : undefined,
                borderColor: active ? 'var(--accent)' : undefined,
              }}
            >
              {opt.label}
              {count > 0 && (
                <span
                  style={{
                    marginLeft: 6,
                    background: active ? 'rgba(255,255,255,0.35)' : 'var(--accent)',
                    color: '#fff',
                    borderRadius: 99,
                    fontSize: 11,
                    padding: '1px 6px',
                  }}
                >
                  {count}
                </span>
              )}
            </button>
          )
        })}
      </div>

      {/* List */}
      {filtered.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '48px 0', color: 'var(--muted)' }}>
          <p style={{ fontSize: 18, marginBottom: 6 }}>No notifications</p>
          <p style={{ fontSize: 14, margin: 0 }}>
            {state.activeFilter === 'all' ? "You're all caught up!" : 'Nothing in this category yet.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'grid', gap: 0 }}>
          {filtered.map((item) => (
            <article
              key={item.id}
              style={{
                borderTop: '1px solid var(--line)',
                paddingTop: 12,
                paddingBottom: 12,
                opacity: item.status === 'read' ? 0.65 : 1,
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'flex-start',
                gap: 12,
              }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ margin: 0, fontWeight: item.status === 'unread' ? 700 : 500 }}>
                  {item.title}{' '}
                  {item.status === 'unread' && (
                    <span style={{ color: 'var(--accent)', fontWeight: 400, fontSize: 13 }}>(new)</span>
                  )}
                </p>
                <p style={{ margin: '4px 0 4px', fontSize: 14 }}>{item.body}</p>
                <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(item.created_at).toLocaleString()} ·{' '}
                  <span style={{ textTransform: 'capitalize' }}>
                    {(TYPE_GROUP[item.type] ?? item.type).replace(/_/g, ' ')}
                  </span>
                </p>
              </div>
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                {item.action_url && (
                  <a
                    href={item.action_url}
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    View
                  </a>
                )}
                {item.status === 'unread' && (
                  <button
                    className="btn btn-primary"
                    style={{ fontSize: 12, padding: '4px 10px' }}
                    onClick={() => handleMarkRead(item.id)}
                  >
                    Mark read
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  )
}
