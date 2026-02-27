import Link from 'next/link'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export default async function Home({
  searchParams,
}: {
  searchParams: { q?: string; type?: string; location?: string }
}) {
  const q = searchParams.q?.trim() ?? ''
  const type = searchParams.type?.trim() ?? ''
  const location = searchParams.location?.trim() ?? ''

  const supabase = createSupabaseServerClient()

  let query = supabase
    .from('directory_entities')
    .select('id,entity_type,slug,name,specialty,location,average_rating,rating_count,description')
    .eq('is_active', true)
    .order('rating_count', { ascending: false })
    .limit(24)

  if (q) query = query.ilike('name', `%${q}%`)
  if (type && ['doctor', 'facility', 'practice'].includes(type)) query = query.eq('entity_type', type)
  if (location) query = query.ilike('location', `%${location}%`)

  const { data: entities } = await query

  return (
    <main>
      <section className="container" style={{ padding: '36px 0 18px' }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 36, margin: 0 }}>OpenMD Directory</h1>
              <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
                Public reviews for doctors, facilities, and practices.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link className="btn btn-secondary" href="/login">
                Login
              </Link>
              <Link className="btn btn-primary" href="/signup">
                Create Tenant
              </Link>
            </div>
          </div>

          <form style={{ marginTop: 18, display: 'grid', gridTemplateColumns: '2fr 1fr 1fr auto', gap: 10 }}>
            <input name="q" defaultValue={q} className="field" placeholder="Search by name" />
            <select name="type" defaultValue={type} className="field">
              <option value="">All types</option>
              <option value="doctor">Doctors</option>
              <option value="facility">Facilities</option>
              <option value="practice">Practices</option>
            </select>
            <input name="location" defaultValue={location} className="field" placeholder="Location" />
            <button className="btn btn-primary" type="submit">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14 }}>
          {(entities ?? []).map((entity) => (
            <Link
              key={entity.id}
              href={`/directory/${entity.entity_type}/${entity.slug}`}
              className="card"
              style={{ display: 'block', padding: 16, textDecoration: 'none' }}
            >
              <div style={{ fontSize: 12, textTransform: 'uppercase', color: 'var(--muted)' }}>{entity.entity_type}</div>
              <h2 style={{ margin: '6px 0 8px', fontSize: 22 }}>{entity.name}</h2>
              {entity.specialty && <p style={{ margin: '0 0 4px', color: 'var(--muted)' }}>{entity.specialty}</p>}
              {entity.location && <p style={{ margin: '0 0 8px', color: 'var(--muted)' }}>{entity.location}</p>}
              <p style={{ margin: 0 }}>
                {Number(entity.average_rating || 0).toFixed(1)} stars ({entity.rating_count} reviews)
              </p>
            </Link>
          ))}
        </div>
      </section>
    </main>
  )
}
