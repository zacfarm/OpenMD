import { revalidatePath } from 'next/cache'  
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'  
import { hasPermission } from '@/lib/rbac'

// Define a type for your marketplace post for better type safety  
interface MarketplacePost {  
  id: string;  
  post_type: 'facility_request' | 'provider_offer';  
  title: string;  
  specialty: string | null;  
  location: string | null;  
  starts_at: string | null;  
  ends_at: string | null;  
  details: string | null;  
  status: 'open' | 'claimed' | 'closed'; // Assuming these are the possible statuses  
  created_by: string;  
  claimed_by_user_id: string | null;  
  created_at: string;  
}

// Server Action: Create a new marketplace post  
async function createMarketplacePost(formData: FormData) {  
  'use server'

  const supabase = await createSupabaseServerClient()  
  const {  
    data: { user },  
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const postType = String(formData.get('postType') || '')  
  if (!['facility_request', 'provider_offer'].includes(postType)) {  
    redirect('/bookings?error=Invalid marketplace post type.')  
  }

  const { data: membership } = await supabase  
    .from('tenant_memberships')  
    .select('tenant_id,role')  
    .eq('user_id', user.id)  
    .limit(1)  
    .maybeSingle()

  if (!hasPermission(membership?.role, 'create_marketplace_post')) {  
    redirect('/bookings?error=You do not have permission to publish marketplace posts.')  
  }

  const { data: providerProfile } = await supabase  
    .from('provider_profiles')  
    .select('id')  
    .eq('user_id', user.id)  
    .limit(1)  
    .maybeSingle()

  const title = String(formData.get('title') || '').trim()  
  if (!title) {  
    redirect('/bookings?error=Title is required.')  
  }

  const { error } = await supabase.from('marketplace_posts').insert({  
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

  if (error) {  
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)  
  }

  revalidatePath('/bookings')  
  redirect('/bookings?success=Marketplace post published.')  
}

// Server Action: Claim a marketplace post  
async function claimMarketplacePost(formData: FormData) {  
  'use server'

  const supabase = await createSupabaseServerClient()  
  const {  
    data: { user },  
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const postId = String(formData.get('postId') || '')  
  if (!postId) {  
    redirect('/bookings?error=Missing marketplace post.')  
  }

  const { data: post } = await supabase  
    .from('marketplace_posts')  
    .select('created_by,status,claimed_by_user_id') // Also select claimed_by_user_id for more robust check  
    .eq('id', postId)  
    .maybeSingle()

  if (!post) {  
    redirect('/bookings?error=Marketplace post not found.')  
  }

  if (post.status !== 'open') {  
    redirect('/bookings?error=This post is no longer open.')  
  }

  if (post.claimed_by_user_id !== null) { // Additional check if already claimed  
    redirect('/bookings?error=This post has already been claimed.')  
  }

  if (post.created_by === user.id) {  
    redirect('/bookings?error=You cannot claim your own post.')  
  }

  // BUG FIX/IMPROVEMENT: Add permission check from the second snippet's implicit logic  
  const { data: membership } = await supabase  
    .from('tenant_memberships')  
    .select('role')  
    .eq('user_id', user.id)  
    .limit(1)  
    .maybeSingle()  
  if (!hasPermission(membership?.role, 'create_booking')) {  
    redirect('/bookings?error=You do not have permission to claim marketplace posts.')  
  }

  const { error } = await supabase.rpc('claim_marketplace_post_text', { post_id_input: postId })  
  if (error) {  
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)  
  }

  revalidatePath('/bookings')  
  revalidatePath('/calendar') // Revalidate calendar as well, if applicable  
  redirect('/bookings?success=Marketplace post claimed.')  
}


async function closeMarketplacePost(formData: FormData) {  
  'use server'

  const supabase = await createSupabaseServerClient()  
  const {  
    data: { user },  
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase  
    .from('tenant_memberships')  
    .select('role')  
    .eq('user_id', user.id)  
    .limit(1)  
    .maybeSingle()

  if (!hasPermission(membership?.role, 'manage_bookings')) {  
    redirect('/bookings?error=You do not have permission to close marketplace posts.')  
  }

  const postId = String(formData.get('postId') || '')  
  if (!postId) {  
    redirect('/bookings?error=Missing marketplace post.')  
  }

  const { error } = await supabase  
    .from('marketplace_posts')  
    .update({ status: 'closed' })  
    .eq('id', postId)  
    .eq('created_by', user.id) // Ensure only the creator can close their post

  if (error) {  
    redirect(`/bookings?error=${encodeURIComponent(error.message)}`)  
  }

  revalidatePath('/bookings')  
  redirect('/bookings?success=Marketplace post closed.')  
}


export default async function BookingsPage({  
  searchParams,  
}: {  
  // BUG FIX: Corrected searchParams type and removed 'await'  
  searchParams?: { error?: string; success?: string }  
}) {  
  const resolvedSearchParams = searchParams // Use searchParams directly, no await needed

  const supabase = await createSupabaseServerClient()  
  const {  
    data: { user },  
  } = await supabase.auth.getUser()

  // BUG FIX: Added explicit user check for robustness  
  if (!user) redirect('/login')

  const { data: membership } = await supabase  
    .from('tenant_memberships')  
    .select('role')  
    .eq('user_id', user.id) // Now safe after the user check  
    .limit(1)  
    .maybeSingle()

  const role = membership?.role ?? null

  const { data: posts } = await supabase  
    .from('marketplace_posts')  
    .select('id,post_type,title,specialty,location,starts_at,ends_at,details,status,created_by,claimed_by_user_id,created_at')  
    .order('created_at', { ascending: false })  
    .limit(100) as { data: MarketplacePost[] | null }; // Type assertion for clarity

  // --- Filtering posts into categories ---  
  const allPosts = posts ?? [];

  // Posts created by the current user  
  const myPosts = allPosts.filter(post => post.created_by === user.id);

  // Posts claimed by the current user (and not created by them)  
  const myClaimedPosts = allPosts.filter(  
    post => post.claimed_by_user_id === user.id && post.created_by !== user.id  
  );

  // Posts that are open, not created by the current user, and not yet claimed by anyone  
  const availableToClaimPosts = allPosts.filter(post =>  
    post.status === 'open' &&  
    post.created_by !== user.id &&  
    post.claimed_by_user_id === null  
  );

  // Helper component to render a single post  
  const renderPost = (post: MarketplacePost, currentUserRole: string | null, userId: string) => {  
    const isCreator = userId === post.created_by  
    const isOpen = post.status === 'open'  
    const canClaimPost = !isCreator && isOpen && post.claimed_by_user_id === null && hasPermission(currentUserRole, 'create_booking');

    return (  
      <div key={post.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>  
        <p style={{ margin: 0, fontWeight: 700 }}>  
          {post.title} ({post.post_type === 'facility_request' ? 'Facility Request' : 'Provider Offer'})  
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

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginTop: 8 }}>  
          {/* Claim button, primarily for 'Available to Claim' section posts */}  
          {canClaimPost && (  
            <form action={claimMarketplacePost}>  
              <input type="hidden" name="postId" value={post.id} />  
              <button className="btn btn-secondary" type="submit">  
                Claim  
              </button>  
            </form>  
          )}

          {/* Info text for creator of open posts */}  
          {isCreator && isOpen && (  
            // BUG FIX: Wrapped orphaned text in a <p> tag  
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>  
              Open posts can be accepted by any other signed-in OpenMD user.  
            </p>  
          )}

          {/* Close button, primarily for 'My Posts' section posts */}  
          {isCreator && post.status !== 'closed' && hasPermission(currentUserRole, 'manage_bookings') && (  
            <form action={closeMarketplacePost}>  
              <input type="hidden" name="postId" value={post.id} />  
              <button className="btn btn-secondary" type="submit">  
                Close  
              </button>  
            </form>  
          )}  
          {/* If post is claimed by someone else, show claimed status (could be extended with claimant info) */}  
          {!isCreator && post.claimed_by_user_id && post.claimed_by_user_id !== userId && (  
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 12 }}>Claimed by another user.</p>  
          )}  
        </div>  
      </div>  
    );  
  };


  return (  
    <section style={{ display: 'grid', gap: 14 }}>  
      <article className="card" style={{ padding: 18 }}>  
        <h1 style={{ marginTop: 0 }}>Global Work Marketplace</h1>  
        <p style={{ color: 'var(--muted)' }}>  
          This board is global across OpenMD. Facility requests and provider availability posts are visible to all  
          authenticated users across practices and facilities.  
        </p>  
        {resolvedSearchParams?.error && <p style={{ color: 'var(--warning)', margin: '8px 0' }}>{resolvedSearchParams.error}</p>}  
        {resolvedSearchParams?.success && <p style={{ color: 'var(--ok)', margin: '8px 0' }}>{resolvedSearchParams.success}</p>}

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

        {/* Section: Available to Claim */}  
        <h3 style={{ marginTop: 20, marginBottom: 10 }}>Available to Claim ({availableToClaimPosts.length})</h3>  
        <div style={{ display: 'grid', gap: 10 }}>  
          {availableToClaimPosts.length > 0 ? (  
            availableToClaimPosts.map((post) => renderPost(post, role, user.id))  
          ) : (  
            <p style={{ color: 'var(--muted)' }}>No posts currently available to claim.</p>  
          )}  
        </div>

        {/* Section: My Posts */}  
        <h3 style={{ marginTop: 20, marginBottom: 10 }}>My Posts ({myPosts.length})</h3>  
        <div style={{ display: 'grid', gap: 10 }}>  
          {myPosts.length > 0 ? (  
            myPosts.map((post) => renderPost(post, role, user.id))  
          ) : (  
            <p style={{ color: 'var(--muted)' }}>You haven't published any posts yet.</p>  
          )}  
        </div>

        {/* Section: My Claimed Posts */}  
        <h3 style={{ marginTop: 20, marginBottom: 10 }}>My Claimed Posts ({myClaimedPosts.length})</h3>  
        <div style={{ display: 'grid', gap: 10 }}>  
          {myClaimedPosts.length > 0 ? (  
            myClaimedPosts.map((post) => renderPost(post, role, user.id))  
          ) : (  
            <p style={{ color: 'var(--muted)' }}>You haven't claimed any posts yet.</p>  
          )}  
        </div>

      </article>  
    </section>  
  )  
}  