'use client'

import { useState, useEffect } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseBrowser'

function urlBase64ToUint8Array(base64String: string): ArrayBuffer {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4)
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/')
  const rawData = atob(base64)
  const arr = Uint8Array.from([...rawData].map((c) => c.charCodeAt(0)))
  return arr.buffer as ArrayBuffer
}

export function PushSubscribeButton() {
  const [supported, setSupported] = useState(false)
  const [status, setStatus] = useState<'idle' | 'loading' | 'subscribed' | 'denied'>('idle')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey || !('serviceWorker' in navigator) || !('PushManager' in window)) return
    setSupported(true)

    // Check current subscription state
    navigator.serviceWorker.register('/sw.js').then((reg) => {
      reg.pushManager.getSubscription().then((sub) => {
        if (sub) setStatus('subscribed')
      })
    })
  }, [])

  if (!supported) return null

  const handleSubscribe = async () => {
    const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
    if (!vapidKey) return
    setStatus('loading')
    setError(null)
    try {
      const supabase = createSupabaseBrowserClient()
      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) {
        throw new Error('You must be signed in to enable push notifications')
      }

      const reg = await navigator.serviceWorker.register('/sw.js')
      const subscription = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlBase64ToUint8Array(vapidKey),
      })
      const json = subscription.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } }
      const { error: dbError } = await supabase.from('push_subscriptions').upsert(
        {
          user_id: user.id,
          endpoint: json.endpoint,
          p256dh: json.keys.p256dh,
          auth_key: json.keys.auth,
        },
        { onConflict: 'user_id,endpoint' }
      )
      if (dbError) throw new Error(dbError.message)
      setStatus('subscribed')
    } catch (err: unknown) {
      if (err instanceof Error && err.name === 'NotAllowedError') {
        setStatus('denied')
      } else {
        setError(err instanceof Error ? err.message : 'Unknown error')
        setStatus('idle')
      }
    }
  }

  const handleUnsubscribe = async () => {
    setStatus('loading')
    try {
      const reg = await navigator.serviceWorker.getRegistration('/sw.js')
      if (reg) {
        const sub = await reg.pushManager.getSubscription()
        if (sub) {
          const supabase = createSupabaseBrowserClient()
          await supabase.from('push_subscriptions').delete().eq('endpoint', sub.endpoint)
          await sub.unsubscribe()
        }
      }
      setStatus('idle')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Unknown error')
      setStatus('subscribed')
    }
  }

  return (
    <div className="card" style={{ padding: 18 }}>
      <h2 style={{ marginTop: 0, fontSize: 16 }}>Browser Push Notifications</h2>
      <p style={{ color: 'var(--muted)', fontSize: 14, marginBottom: 14 }}>
        Receive notifications in your browser even when you&apos;re not on this page.
      </p>

      {status === 'denied' ? (
        <p style={{ color: 'var(--muted)', fontSize: 14, margin: 0 }}>
          Push notifications are blocked. Enable them in your browser&apos;s site settings and reload.
        </p>
      ) : status === 'subscribed' ? (
        <button className="btn btn-primary" onClick={handleUnsubscribe}>
          Disable push notifications
        </button>
      ) : (
        <button
          className="btn btn-primary"
          onClick={handleSubscribe}
          disabled={status === 'loading'}
        >
          {status === 'loading' ? 'Enabling…' : 'Enable push notifications'}
        </button>
      )}

      {error && (
        <p style={{ color: 'red', fontSize: 13, marginTop: 8, marginBottom: 0 }}>{error}</p>
      )}
    </div>
  )
}
