import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { hasPermission } from '@/lib/rbac'

async function createMarketplacePost(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const postType = String(formData.get('postType') || '')
  if (!['facility_request', 'provider_offer'].includes(postType)) return

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'create_marketplace_post')) return

  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  const title = String(formData.get('title') || '').trim()
  if (!title) return

  await supabase.from('marketplace_posts').insert({
    post_type: postType,
    tenant_id: membership?.tenant_id ?? null,
    provider_id: postType === 'provider_offer' ? (providerProfile?.id ?? null) : null,
    title,
    specialty: String(formData.get('specialty') || '').trim() || null,
    location: String(formData.get('location') || '').trim() || null,
    starts_at: String(formData.get('startsAt') || '').trim() || null,
    ends_at: String(formData.get('endsAt') || '').trim() || null,
    details: String(formData.get('details') || '').trim() || null,
    created_by: user.id,
  })

  revalidatePath('/bookings')
}

async function claimMarketplacePost(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'create_booking')) return

  const postId = String(formData.get('postId') || '')
  if (!postId) return

  await supabase.rpc('claim_marketplace_post', { post_id: postId })
  revalidatePath('/bookings')
}

async function closeMarketplacePost(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'manage_bookings')) return

  const postId = String(formData.get('postId') || '')
  if (!postId) return

  await supabase
    .from('marketplace_posts')
    .update({ status: 'closed' })
    .eq('id', postId)
    .eq('created_by', user.id)

  revalidatePath('/bookings')
}

export default async function BookingsPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('role')
    .eq('user_id', user!.id)
    .limit(1)
    .maybeSingle()

  const role = membership?.role ?? null

  const { data: posts } = await supabase
    .from('marketplace_posts')
    .select('id,post_type,title,specialty,location,starts_at,ends_at,details,status,created_by,claimed_by_user_id,created_at')
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Global Work Marketplace</h1>
        <p style={{ color: 'var(--muted)' }}>
          This board is global across OpenMD. Facility requests and provider availability posts are visible to all
          authenticated users across practices and facilities.
        </p>

        {hasPermission(role, 'create_marketplace_post') ? (
          <form action={createMarketplacePost} style={{ display: 'grid', gap: 10, gridTemplateColumns: '1fr 2fr 1fr 1fr 1fr 1fr' }}>
            <select className="field" name="postType" defaultValue="facility_request">
              <option value="facility_request">Facility work request</option>
              <option value="provider_offer">Provider availability post</option>
            </select>
            <input className="field" name="title" placeholder="Title (ER night coverage, Cardiology locum, etc.)" required />
            <input className="field" name="specialty" placeholder="Specialty" />
            <input className="field" name="location" placeholder="Location" />
            <input className="field" type="datetime-local" name="startsAt" />
            <input className="field" type="datetime-local" name="endsAt" />
            <input className="field" style={{ gridColumn: '1 / 6' }} name="details" placeholder="Details (requirements, notes, compensation details)" />
            <button className="btn btn-primary" type="submit">
              Publish post
            </button>
          </form>
        ) : (
          <p style={{ color: 'var(--muted)', fontSize: 13 }}>Your role does not permit creating marketplace posts.</p>
        )}
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Marketplace Feed</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(posts ?? []).map((post) => {
            const isCreator = user?.id === post.created_by
            const isOpen = post.status === 'open'

            return (
              <div key={post.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <p style={{ margin: 0, fontWeight: 700 }}>
                  {post.title} <span style={{ color: 'var(--muted)' }}>({post.post_type === 'facility_request' ? 'Facility Request' : 'Provider Offer'})</span>
                </p>
                <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                  {post.specialty ?? 'General'} | {post.location ?? 'No location'} | Status: {post.status}
                </p>
                {(post.starts_at || post.ends_at) && (
                  <p style={{ margin: '4px 0' }}>
                    {post.starts_at ? new Date(post.starts_at).toLocaleString() : 'TBD'} -{' '}
                    {post.ends_at ? new Date(post.ends_at).toLocaleString() : 'TBD'}
                  </p>
                )}
                {post.details && <p style={{ margin: '4px 0' }}>{post.details}</p>}

                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {isOpen && hasPermission(role, 'create_booking') && (
                    <form action={claimMarketplacePost}>
                      <input type="hidden" name="postId" value={post.id} />
                      <button className="btn btn-secondary" type="submit">
                        Claim
                      </button>
                    </form>
                  )}

                  {isCreator && post.status !== 'closed' && hasPermission(role, 'manage_bookings') && (
                    <form action={closeMarketplacePost}>
                      <input type="hidden" name="postId" value={post.id} />
                      <button className="btn btn-secondary" type="submit">
                        Close
                      </button>
                    </form>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}
