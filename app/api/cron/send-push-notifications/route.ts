import { NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import webpush from 'web-push'

/**
 * GET /api/cron/send-push-notifications
 *
 * Sends Web Push notifications for unread notifications created in the
 * past 5 minutes. Runs every 5 minutes via Vercel cron.
 *
 * Requires env vars:
 *   NEXT_PUBLIC_VAPID_PUBLIC_KEY
 *   VAPID_PRIVATE_KEY
 *   VAPID_MAILTO          (e.g. mailto:admin@yourdomain.com)
 *   SUPABASE_SERVICE_ROLE_KEY
 *
 * Generate VAPID keys with:
 *   npx web-push generate-vapid-keys
 */
export async function GET(req: Request) {
  // Optional debug override: /api/cron/send-push-notifications?minutes=120
  const requestUrl = new URL(req.url)
  const overrideMinutes = Number(requestUrl.searchParams.get('minutes') || '')
  const lookbackMinutes = Number.isFinite(overrideMinutes) && overrideMinutes > 0
    ? overrideMinutes
    : 5

  const vapidPublic = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY
  const vapidPrivate = process.env.VAPID_PRIVATE_KEY
  const vapidMailto = process.env.VAPID_MAILTO

  if (!vapidPublic || !vapidPrivate || !vapidMailto) {
    // Push not configured — skip silently
    return NextResponse.json({ ok: true, skipped: true, reason: 'missing_vapid_env' })
  }

  webpush.setVapidDetails(vapidMailto, vapidPublic, vapidPrivate)

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )

  const since = new Date(Date.now() - lookbackMinutes * 60 * 1000).toISOString()
  const { data: rows, error } = await supabase.rpc('get_pending_push_notifications', {
    since_time: since,
  })

  if (error) {
    console.error('[cron/send-push-notifications]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({ ok: true, sent: 0, scanned: 0, lookbackMinutes })
  }

  type Row = {
    notification_id: string
    endpoint: string
    p256dh: string
    auth_key: string
    title: string
    body: string
    action_url: string | null
  }

  const appUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  let sentCount = 0
  const staleEndpoints: string[] = []

  await Promise.allSettled(
    (rows as Row[]).map(async (row) => {
      const payload = JSON.stringify({
        title: row.title,
        body: row.body,
        url: row.action_url ? `${appUrl}${row.action_url}` : `${appUrl}/notifications`,
        icon: '/icon-192.png',
      })
      try {
        await webpush.sendNotification(
          { endpoint: row.endpoint, keys: { p256dh: row.p256dh, auth: row.auth_key } },
          payload
        )
        sentCount++
      } catch (err: unknown) {
        // 410 Gone = subscription expired, clean it up
        if (err instanceof Error && 'statusCode' in err && (err as { statusCode: number }).statusCode === 410) {
          staleEndpoints.push(row.endpoint)
        } else {
          console.error('[push] send failed:', err)
        }
      }
    })
  )

  // Remove expired push subscriptions
  if (staleEndpoints.length > 0) {
    await supabase.from('push_subscriptions').delete().in('endpoint', staleEndpoints)
  }

  return NextResponse.json({ ok: true, sent: sentCount, removed: staleEndpoints.length, scanned: rows.length, lookbackMinutes })
}
