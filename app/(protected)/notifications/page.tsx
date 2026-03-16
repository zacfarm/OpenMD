import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

async function markRead(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const notificationId = String(formData.get('notificationId') || '')

  if (!notificationId) return

  await supabase.from('notifications').update({ status: 'read' }).eq('id', notificationId)
  revalidatePath('/notifications')
}

export default async function NotificationsPage() {
  const supabase = await createSupabaseServerClient()
  const { data: notifications } = await supabase
    .from('notifications')
    .select('id,title,body,type,status,created_at,action_url')
    .order('created_at', { ascending: false })
    .limit(60)

  return (
    <section className="card" style={{ padding: 18 }}>
      <h1 style={{ marginTop: 0 }}>Notification Center</h1>
      <p style={{ color: 'var(--muted)' }}>
        Includes booking requests, booking status changes, and scheduling alerts.
      </p>

      <div style={{ display: 'grid', gap: 10 }}>
        {(notifications ?? []).map((item) => (
          <article key={item.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 12 }}>
            <p style={{ margin: 0, fontWeight: 700 }}>
              {item.title} {item.status === 'unread' && <span style={{ color: 'var(--accent)' }}>(new)</span>}
            </p>
            <p style={{ margin: '4px 0 8px' }}>{item.body}</p>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>{new Date(item.created_at).toLocaleString()}</p>
            <form action={markRead} style={{ marginTop: 8 }}>
              <input type="hidden" name="notificationId" value={item.id} />
              {item.status === 'unread' && (
                <button className="btn btn-secondary" type="submit">
                  Mark read
                </button>
              )}
            </form>
          </article>
        ))}
      </div>
    </section>
  )
}
