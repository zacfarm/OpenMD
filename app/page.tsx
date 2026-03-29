import Link from 'next/link'

import { RatingDisplay } from '@/components/directory/RatingDisplay'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

type OrgCard = {
  id: string
  entity_type: 'practice' | 'facility'
  slug: string
  name: string
  specialty: string | null
  location: string | null
  average_rating: number
  rating_count: number
  description: string | null
}

type ProviderCard = {
  id: string
  parent_entity_id: string | null
  entity_type: 'doctor'
  slug: string
  name: string
  specialty: string | null
  location: string | null
  average_rating: number
  rating_count: number
}

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; type?: string; specialty?: string; location?: string }>
}) {
  const resolvedSearchParams = await searchParams
  const q = resolvedSearchParams.q?.trim() ?? ''
  const type = resolvedSearchParams.type?.trim() ?? ''
  const specialty = resolvedSearchParams.specialty?.trim() ?? ''
  const location = resolvedSearchParams.location?.trim() ?? ''

  const supabase = await createSupabaseServerClient()

  let orgQuery = supabase
    .from('directory_entities')
    .select('id,entity_type,slug,name,specialty,location,average_rating,rating_count,description')
    .eq('is_active', true)
    .is('parent_entity_id', null)
    .in('entity_type', ['practice', 'facility'])
    .order('rating_count', { ascending: false })
    .limit(24)

  if (q) orgQuery = orgQuery.ilike('name', `%${q}%`)
  if (type && ['practice', 'facility'].includes(type)) orgQuery = orgQuery.eq('entity_type', type)
  if (location) orgQuery = orgQuery.ilike('location', `%${location}%`)

  const { data: orgResults } = await orgQuery
  const organizations = ((orgResults ?? []) as OrgCard[]).slice()

  let providerMatches: ProviderCard[] = []

  if (q || specialty || location) {
    let providerQuery = supabase
      .from('directory_entities')
      .select('id,parent_entity_id,entity_type,slug,name,specialty,location,average_rating,rating_count')
      .eq('entity_type', 'doctor')
      .eq('is_active', true)
      .not('parent_entity_id', 'is', null)
      .order('rating_count', { ascending: false })
      .limit(18)

    if (q) providerQuery = providerQuery.ilike('name', `%${q}%`)
    if (specialty) providerQuery = providerQuery.ilike('specialty', `%${specialty}%`)
    if (location) providerQuery = providerQuery.ilike('location', `%${location}%`)

    const { data: providerResults } = await providerQuery
    providerMatches = (providerResults ?? []) as ProviderCard[]
  }

  const orgIds = new Set(organizations.map((org) => org.id))
  const missingParentIds = Array.from(
    new Set(providerMatches.map((provider) => provider.parent_entity_id).filter(Boolean) as string[]),
  ).filter((parentId) => !orgIds.has(parentId))

  if (missingParentIds.length) {
    const { data: providerParentResults } = await supabase
      .from('directory_entities')
      .select('id,entity_type,slug,name,specialty,location,average_rating,rating_count,description')
      .in('id', missingParentIds)

    for (const parent of (providerParentResults ?? []) as OrgCard[]) {
      organizations.push(parent)
      orgIds.add(parent.id)
    }
  }

  const { data: childProviderResults } = orgIds.size
    ? await supabase
        .from('directory_entities')
        .select('id,parent_entity_id,slug,name,specialty,location,average_rating,rating_count')
        .eq('entity_type', 'doctor')
        .eq('is_active', true)
        .in('parent_entity_id', Array.from(orgIds))
        .order('rating_count', { ascending: false })
    : { data: [] }

  const childProviders = (childProviderResults ?? []) as Array<
    ProviderCard & {
      parent_entity_id: string
    }
  >

  const providerSummaryByOrg = new Map<
    string,
    {
      totalReviews: number
      weightedRatingTotal: number
      providers: Array<ProviderCard & { parent_entity_id: string }>
    }
  >()

  for (const provider of childProviders) {
    const current = providerSummaryByOrg.get(provider.parent_entity_id) ?? {
      totalReviews: 0,
      weightedRatingTotal: 0,
      providers: [],
    }

    current.totalReviews += provider.rating_count
    current.weightedRatingTotal += Number(provider.average_rating || 0) * provider.rating_count
    current.providers.push(provider)
    providerSummaryByOrg.set(provider.parent_entity_id, current)
  }

  return (
    <main>
      <section className="container" style={{ padding: '36px 0 18px' }}>
        <div className="card" style={{ padding: 22 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 14, flexWrap: 'wrap' }}>
            <div>
              <h1 style={{ fontSize: 36, margin: 0 }}>OpenMD Directory</h1>
              <p style={{ margin: '8px 0 0', color: 'var(--muted)' }}>
                Public reviews for practices, facilities, and the providers linked to them.
              </p>
            </div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <Link className="btn btn-primary" href="/login">
                Login
              </Link>
              <Link className="btn btn-primary" href="/signup">
                Create Tenant
              </Link>
            </div>
          </div>

          <form
            style={{
              marginTop: 18,
              display: 'grid',
              gridTemplateColumns: '2fr 1fr 1fr 1fr auto',
              gap: 10,
            }}
          >
            <input name="q" defaultValue={q} className="field" placeholder="Practice, facility, or provider name" />
            <select name="type" defaultValue={type} className="field">
              <option value="">All organizations</option>
              <option value="practice">Practices</option>
              <option value="facility">Facilities</option>
            </select>
            <input name="specialty" defaultValue={specialty} className="field" placeholder="Specialty" />
            <input name="location" defaultValue={location} className="field" placeholder="City or state" />
            <button className="btn btn-primary" type="submit">
              Search
            </button>
          </form>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 18 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
          <div>
            <h2 style={{ margin: 0 }}>Organizations</h2>
            <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
              Ratings for each practice or facility plus a separate aggregate for their linked providers.
            </p>
          </div>
          <p style={{ margin: 0, color: 'var(--muted)' }}>{organizations.length} results</p>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 14 }}>
          {organizations.map((entity) => {
            const providerSummary = providerSummaryByOrg.get(entity.id)
            const providerAverage =
              providerSummary && providerSummary.totalReviews > 0
                ? providerSummary.weightedRatingTotal / providerSummary.totalReviews
                : null

            return (
              <Link
                key={entity.id}
                href={`/directory/${entity.entity_type}/${entity.slug}`}
                className="card"
                style={{ display: 'block', padding: 18, textDecoration: 'none' }}
              >
                <div className="eyebrow">{entity.entity_type}</div>
                <h2 style={{ margin: '10px 0 8px', fontSize: 22 }}>{entity.name}</h2>
                {entity.location && <p style={{ margin: '0 0 8px', color: 'var(--muted)' }}>{entity.location}</p>}
                {entity.description && (
                  <p style={{ margin: '0 0 12px', color: 'var(--muted)', lineHeight: 1.5 }}>{entity.description}</p>
                )}

                <div className="summary-grid" style={{ marginTop: 14 }}>
                  <div className="rating-panel">
                    <RatingDisplay label="Organization rating" value={Number(entity.average_rating || 0)} count={entity.rating_count} />
                  </div>
                  <div className="rating-panel">
                    <RatingDisplay
                      label="Provider network"
                      value={providerAverage}
                      count={providerSummary?.totalReviews ?? 0}
                      mutedWhenEmpty="No provider reviews yet"
                    />
                  </div>
                </div>

                {!!providerSummary?.providers.length && (
                  <div style={{ marginTop: 14 }}>
                    <p style={{ margin: '0 0 8px', color: 'var(--muted)', fontSize: 13 }}>Providers at this organization</p>
                    <div className="provider-mini-list">
                    {providerSummary.providers.slice(0, 3).map((provider) => (
                      <div key={provider.id} className="provider-mini-card">
                        <div className="provider-mini-top">
                          <span style={{ fontWeight: 600 }}>{provider.name}</span>
                          <span style={{ color: 'var(--muted)', fontSize: 13 }}>View profile</span>
                        </div>
                        <RatingDisplay value={Number(provider.average_rating || 0)} count={provider.rating_count} size="sm" />
                      </div>
                    ))}
                    </div>
                  </div>
                )}
              </Link>
            )
          })}
        </div>

        {!organizations.length && (
          <div className="card" style={{ padding: 18, marginTop: 14 }}>
            No organizations matched this search.
          </div>
        )}
      </section>

      {!!providerMatches.length && (
        <section className="container" style={{ paddingBottom: 40 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'baseline', flexWrap: 'wrap' }}>
            <div>
              <h2 style={{ margin: 0 }}>Matching Providers</h2>
              <p style={{ margin: '4px 0 0', color: 'var(--muted)' }}>
                Provider results stay linked to the practice or facility they work under.
              </p>
            </div>
            <p style={{ margin: 0, color: 'var(--muted)' }}>{providerMatches.length} results</p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: 14, marginTop: 14 }}>
            {providerMatches.map((provider) => {
              const parent = organizations.find((entity) => entity.id === provider.parent_entity_id)

              return (
                <Link
                  key={provider.id}
                  href={`/directory/doctor/${provider.slug}`}
                  className="card"
                  style={{ display: 'block', padding: 16, textDecoration: 'none' }}
                >
                  <div className="eyebrow">provider</div>
                  <h3 style={{ margin: '10px 0 8px', fontSize: 20 }}>{provider.name}</h3>
                  {provider.specialty && <p style={{ margin: '0 0 4px', color: 'var(--muted)' }}>{provider.specialty}</p>}
                  {provider.location && <p style={{ margin: '0 0 8px', color: 'var(--muted)' }}>{provider.location}</p>}
                  <RatingDisplay value={Number(provider.average_rating || 0)} count={provider.rating_count} />
                  {parent && <p style={{ margin: '10px 0 0', color: 'var(--muted)' }}>Works with {parent.name}</p>}
                </Link>
              )
            })}
          </div>
        </section>
      )}
    </main>
  )
}
