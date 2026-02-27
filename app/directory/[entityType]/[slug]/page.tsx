import { notFound } from 'next/navigation'

import { REVIEW_TAGS } from '@/lib/openmd'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export default async function DirectoryProfilePage({
  params,
}: {
  params: { entityType: string; slug: string }
}) {
  const supabase = createSupabaseServerClient()

  const { data: entity } = await supabase
    .from('directory_entities')
    .select('id,entity_type,name,slug,specialty,location,description,average_rating,rating_count')
    .eq('entity_type', params.entityType)
    .eq('slug', params.slug)
    .single()

  if (!entity) notFound()

  const { data: reviews } = await supabase
    .from('directory_reviews')
    .select('id,star_rating,tags,comment,created_at')
    .eq('entity_id', entity.id)
    .order('created_at', { ascending: false })
    .limit(25)

  return (
    <main className="container" style={{ padding: '34px 0 40px' }}>
      <a href="/" style={{ textDecoration: 'none', color: 'var(--muted)' }}>
        Back to directory
      </a>

      <section className="card" style={{ marginTop: 10, padding: 22 }}>
        <div style={{ display: 'flex', gap: 20, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <div>
            <p style={{ margin: 0, color: 'var(--muted)', textTransform: 'uppercase', fontSize: 12 }}>{entity.entity_type}</p>
            <h1 style={{ margin: '4px 0 8px', fontSize: 34 }}>{entity.name}</h1>
            {entity.specialty && <p style={{ margin: 0 }}>{entity.specialty}</p>}
            {entity.location && <p style={{ margin: '6px 0 0', color: 'var(--muted)' }}>{entity.location}</p>}
          </div>
          <div>
            <p style={{ margin: 0, fontSize: 30, textAlign: 'right' }}>{Number(entity.average_rating || 0).toFixed(1)}</p>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>{entity.rating_count} reviews</p>
          </div>
        </div>
        {entity.description && <p style={{ marginTop: 16 }}>{entity.description}</p>}
      </section>

      <section className="card" style={{ marginTop: 16, padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Leave an anonymous review</h2>
        <p style={{ color: 'var(--warning)', marginTop: 4 }}>
          Public post: do not include PHI, diagnoses, DOB, insurance IDs, or personal identifiers.
        </p>
        <form action="/api/ratings" method="post" style={{ display: 'grid', gap: 10 }}>
          <input type="hidden" name="entityId" value={entity.id} />
          <label>
            Star rating
            <select name="starRating" className="field" required defaultValue="">
              <option value="" disabled>
                Select rating
              </option>
              <option value="5">5 - Excellent</option>
              <option value="4">4 - Good</option>
              <option value="3">3 - Average</option>
              <option value="2">2 - Poor</option>
              <option value="1">1 - Very poor</option>
            </select>
          </label>
          <label>
            Tags (optional)
            <select className="field" name="tags" multiple size={5}>
              {REVIEW_TAGS.map((tag) => (
                <option key={tag} value={tag}>
                  {tag.replace('_', ' ')}
                </option>
              ))}
            </select>
          </label>
          <label>
            Comment (optional, 20-800 chars)
            <textarea name="comment" className="field" rows={4} maxLength={800} />
          </label>
          <button className="btn btn-primary" type="submit">
            Submit review
          </button>
        </form>
      </section>

      <section className="card" style={{ marginTop: 16, padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Recent reviews</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {(reviews ?? []).map((review) => (
            <article key={review.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
              <p style={{ margin: 0, fontWeight: 700 }}>{review.star_rating} / 5</p>
              {!!review.tags?.length && (
                <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>{review.tags.join(', ')}</p>
              )}
              {review.comment && <p style={{ margin: '8px 0 0' }}>{review.comment}</p>}
            </article>
          ))}
        </div>
      </section>
    </main>
  )
}
