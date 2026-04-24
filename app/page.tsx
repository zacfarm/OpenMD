import Link from "next/link";

import { RatingDisplay } from "@/components/directory/RatingDisplay";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type OrgCard = {
  id: string;
  entity_type: "practice" | "facility";
  slug: string;
  name: string;
  specialty: string | null;
  location: string | null;
  average_rating: number;
  rating_count: number;
  description: string | null;
};

type ProviderCard = {
  id: string;
  parent_entity_id: string | null;
  entity_type: "doctor";
  slug: string;
  name: string;
  specialty: string | null;
  location: string | null;
  average_rating: number;
  rating_count: number;
};

export default async function Home({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string;
    type?: string;
    specialty?: string;
    location?: string;
  }>;
}) {
  const resolvedSearchParams = await searchParams;
  const q = resolvedSearchParams.q?.trim() ?? "";
  const type = resolvedSearchParams.type?.trim() ?? "";
  const specialty = resolvedSearchParams.specialty?.trim() ?? "";
  const location = resolvedSearchParams.location?.trim() ?? "";

  const supabase = await createSupabaseServerClient();

  let orgQuery = supabase
    .from("directory_entities")
    .select(
      "id,entity_type,slug,name,specialty,location,average_rating,rating_count,description",
    )
    .eq("is_active", true)
    .is("parent_entity_id", null)
    .in("entity_type", ["practice", "facility"])
    .order("rating_count", { ascending: false })
    .limit(24);

  if (q) orgQuery = orgQuery.ilike("name", `%${q}%`);
  if (type && ["practice", "facility"].includes(type))
    orgQuery = orgQuery.eq("entity_type", type);
  if (location) orgQuery = orgQuery.ilike("location", `%${location}%`);

  const { data: orgResults } = await orgQuery;
  const organizations = ((orgResults ?? []) as OrgCard[]).slice();

  let providerMatches: ProviderCard[] = [];

  if (q || specialty || location) {
    let providerQuery = supabase
      .from("directory_entities")
      .select(
        "id,parent_entity_id,entity_type,slug,name,specialty,location,average_rating,rating_count",
      )
      .eq("entity_type", "doctor")
      .eq("is_active", true)
      .not("parent_entity_id", "is", null)
      .order("rating_count", { ascending: false })
      .limit(18);

    if (q) providerQuery = providerQuery.ilike("name", `%${q}%`);
    if (specialty)
      providerQuery = providerQuery.ilike("specialty", `%${specialty}%`);
    if (location)
      providerQuery = providerQuery.ilike("location", `%${location}%`);

    const { data: providerResults } = await providerQuery;
    providerMatches = (providerResults ?? []) as ProviderCard[];
  }

  const orgIds = new Set(organizations.map((org) => org.id));
  const missingParentIds = Array.from(
    new Set(
      providerMatches
        .map((provider) => provider.parent_entity_id)
        .filter(Boolean) as string[],
    ),
  ).filter((parentId) => !orgIds.has(parentId));

  if (missingParentIds.length) {
    const { data: providerParentResults } = await supabase
      .from("directory_entities")
      .select(
        "id,entity_type,slug,name,specialty,location,average_rating,rating_count,description",
      )
      .in("id", missingParentIds);

    for (const parent of (providerParentResults ?? []) as OrgCard[]) {
      organizations.push(parent);
      orgIds.add(parent.id);
    }
  }

  const { data: childProviderResults } = orgIds.size
    ? await supabase
        .from("directory_entities")
        .select(
          "id,parent_entity_id,slug,name,specialty,location,average_rating,rating_count",
        )
        .eq("entity_type", "doctor")
        .eq("is_active", true)
        .in("parent_entity_id", Array.from(orgIds))
        .order("rating_count", { ascending: false })
    : { data: [] };

  const childProviders = (childProviderResults ?? []) as Array<
    ProviderCard & {
      parent_entity_id: string;
    }
  >;

  const providerSummaryByOrg = new Map<
    string,
    {
      totalReviews: number;
      weightedRatingTotal: number;
      providers: Array<ProviderCard & { parent_entity_id: string }>;
    }
  >();

  for (const provider of childProviders) {
    const current = providerSummaryByOrg.get(provider.parent_entity_id) ?? {
      totalReviews: 0,
      weightedRatingTotal: 0,
      providers: [],
    };

    current.totalReviews += provider.rating_count;
    current.weightedRatingTotal +=
      Number(provider.average_rating || 0) * provider.rating_count;
    current.providers.push(provider);
    providerSummaryByOrg.set(provider.parent_entity_id, current);
  }

  const totalOrgReviews = organizations.reduce(
    (sum, entity) => sum + entity.rating_count,
    0,
  );
  const totalProviderReviews = childProviders.reduce(
    (sum, provider) => sum + provider.rating_count,
    0,
  );
  const totalReviews = totalOrgReviews + totalProviderReviews;
  const topRatedOrganizations = organizations
    .filter((entity) => entity.rating_count > 0)
    .sort(
      (a, b) => Number(b.average_rating || 0) - Number(a.average_rating || 0),
    )
    .slice(0, 3);

  return (
    <main className="landing-main">
      <section className="container landing-topbar-wrap">
        <div className="landing-topbar card">
          <div>
            <p className="landing-topbar-brand">OpenMD</p>
            <p className="landing-topbar-sub">Healthcare operations platform</p>
          </div>
          <div className="landing-topbar-actions">
            <Link className="btn btn-secondary" href="/login">
              Sign In
            </Link>
            <Link className="btn btn-primary" href="/signup">
              Create Tenenat space
            </Link>
          </div>
        </div>
      </section>

      <section className="container landing-hero-section">
        <div className="landing-hero-grid">
          <article className="card landing-hero-card">
            <p className="landing-kicker">OpenMD Intelligence Layer</p>
            <h1 className="landing-title">
              Trusted clinical marketplace with transparent provider ratings.
            </h1>
            <p className="landing-subtitle">
              OpenMD helps practices, facilities, and providers coordinate
              faster, recruit smarter, and monitor quality with live review
              signals.
            </p>

            <div className="landing-trend-card" aria-hidden="true">
              <p className="landing-trend-label">Quality trend signal</p>
              <svg
                className="landing-trend-svg"
                viewBox="0 0 300 110"
                role="presentation"
                focusable="false"
              >
                <path
                  className="landing-trend-grid"
                  d="M0 95 H300 M0 65 H300 M0 35 H300"
                />
                <path
                  className="landing-trend-line"
                  d="M10 88 C 42 76, 64 68, 92 71 C 120 74, 142 56, 166 50 C 190 44, 220 55, 246 36 C 262 24, 278 16, 292 14"
                />
                <circle
                  className="landing-trend-point"
                  cx="92"
                  cy="71"
                  r="3.4"
                />
                <circle
                  className="landing-trend-point"
                  cx="166"
                  cy="50"
                  r="3.4"
                />
                <circle
                  className="landing-trend-point"
                  cx="246"
                  cy="36"
                  r="3.4"
                />
                <circle
                  className="landing-trend-point landing-trend-point-final"
                  cx="292"
                  cy="14"
                  r="4.2"
                />
              </svg>
            </div>

            <div className="landing-hero-graphic" aria-hidden="true">
              <span className="landing-hero-ring landing-hero-ring-1" />
              <span className="landing-hero-ring landing-hero-ring-2" />
              <span className="landing-hero-dot landing-hero-dot-1" />
              <span className="landing-hero-dot landing-hero-dot-2" />
              <span className="landing-hero-dot landing-hero-dot-3" />
            </div>

            <div className="landing-cta-row">
              <Link className="btn btn-primary" href="#directory-results">
                Explore Directory
              </Link>
              <Link className="btn btn-secondary" href="/directory/practice">
                View Public Profiles
              </Link>
            </div>

            <div className="landing-stat-row">
              <div className="landing-stat-chip">
                <strong>{organizations.length}</strong>
                <span>Organizations</span>
              </div>
              <div className="landing-stat-chip">
                <strong>{childProviders.length}</strong>
                <span>Linked providers</span>
              </div>
              <div className="landing-stat-chip">
                <strong>{totalReviews}</strong>
                <span>Public reviews</span>
              </div>
            </div>
          </article>
        </div>

        <div className="card landing-search-card">
          <div className="section-head">
            <div>
              <h2 style={{ margin: 0 }}>Explore the OpenMD Directory</h2>
              <p className="section-subtitle">
                Filter practices and facilities, then inspect linked providers
                and rating strength.
              </p>
            </div>
          </div>

          <form className="landing-search-grid">
            <input
              name="q"
              defaultValue={q}
              className="field"
              placeholder="Practice, facility, or provider name"
            />
            <select name="type" defaultValue={type} className="field">
              <option value="">All organizations</option>
              <option value="practice">Practices</option>
              <option value="facility">Facilities</option>
            </select>
            <input
              name="specialty"
              defaultValue={specialty}
              className="field"
              placeholder="Specialty"
            />
            <input
              name="location"
              defaultValue={location}
              className="field"
              placeholder="City or state"
            />
            <button className="btn btn-primary" type="submit">
              Search Directory
            </button>
          </form>
        </div>

        {!!topRatedOrganizations.length && (
          <div className="landing-highlight-row">
            {topRatedOrganizations.map((entity) => (
              <article key={entity.id} className="card landing-highlight-card">
                <p className="landing-highlight-eyebrow">
                  Top rated organization
                </p>
                <h3>{entity.name}</h3>
                <p>{entity.location || "Location not listed"}</p>
                <RatingDisplay
                  value={Number(entity.average_rating || 0)}
                  count={entity.rating_count}
                />
              </article>
            ))}
          </div>
        )}
      </section>

      <section className="container" style={{ paddingBottom: 18 }}>
        <div className="card" style={{ padding: 18 }}>
          <div className="section-head">
            <div>
              <h2 style={{ margin: 0 }}>
                Built for modern healthcare operations
              </h2>
              <p className="section-subtitle">
                OpenMD combines a verified provider ecosystem with
                enterprise-grade workflows for team-based clinical coordination.
              </p>
            </div>
          </div>

          <div className="landing-info-grid">
            <article className="landing-info-card">
              <h3>Credential-aware staffing</h3>
              <p>
                Keep provider coverage resilient with profile context,
                role-aware access, and marketplace-driven staffing.
              </p>
            </article>
            <article className="landing-info-card">
              <h3>Scheduling and case visibility</h3>
              <p>
                Coordinate cases across facilities with structured timelines,
                statuses, and integrated communication loops.
              </p>
            </article>
            <article className="landing-info-card">
              <h3>Review-driven quality signal</h3>
              <p>
                Use organization and provider ratings to benchmark reliability
                and confidence before engagement.
              </p>
            </article>
          </div>
        </div>
      </section>

      <section
        id="directory-results"
        className="container"
        style={{ paddingBottom: 18 }}
      >
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            gap: 12,
            alignItems: "baseline",
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>Organizations</h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
              Ratings for each practice or facility plus a separate aggregate
              for their linked providers.
            </p>
          </div>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {organizations.length} results
          </p>
        </div>
      </section>

      <section className="container" style={{ paddingBottom: 40 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))",
            gap: 14,
          }}
        >
          {organizations.map((entity) => {
            const providerSummary = providerSummaryByOrg.get(entity.id);
            const providerAverage =
              providerSummary && providerSummary.totalReviews > 0
                ? providerSummary.weightedRatingTotal /
                  providerSummary.totalReviews
                : null;

            return (
              <Link
                key={entity.id}
                href={`/directory/${entity.entity_type}/${entity.slug}`}
                className="card"
                style={{
                  display: "block",
                  padding: 18,
                  textDecoration: "none",
                }}
              >
                <div className="eyebrow">{entity.entity_type}</div>
                <h2 style={{ margin: "10px 0 8px", fontSize: 22 }}>
                  {entity.name}
                </h2>
                {entity.location && (
                  <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>
                    {entity.location}
                  </p>
                )}
                {entity.description && (
                  <p
                    style={{
                      margin: "0 0 12px",
                      color: "var(--muted)",
                      lineHeight: 1.5,
                    }}
                  >
                    {entity.description}
                  </p>
                )}

                <div className="summary-grid" style={{ marginTop: 14 }}>
                  <div className="rating-panel">
                    <RatingDisplay
                      label="Organization rating"
                      value={Number(entity.average_rating || 0)}
                      count={entity.rating_count}
                    />
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
                    <p
                      style={{
                        margin: "0 0 8px",
                        color: "var(--muted)",
                        fontSize: 13,
                      }}
                    >
                      Providers at this organization
                    </p>
                    <div className="provider-mini-list">
                      {providerSummary.providers.slice(0, 3).map((provider) => (
                        <div key={provider.id} className="provider-mini-card">
                          <div className="provider-mini-top">
                            <span style={{ fontWeight: 600 }}>
                              {provider.name}
                            </span>
                            <span
                              style={{ color: "var(--muted)", fontSize: 13 }}
                            >
                              View profile
                            </span>
                          </div>
                          <RatingDisplay
                            value={Number(provider.average_rating || 0)}
                            count={provider.rating_count}
                            size="sm"
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </Link>
            );
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
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              gap: 12,
              alignItems: "baseline",
              flexWrap: "wrap",
            }}
          >
            <div>
              <h2 style={{ margin: 0 }}>Matching Providers</h2>
              <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                Provider results stay linked to the practice or facility they
                work under.
              </p>
            </div>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {providerMatches.length} results
            </p>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
              gap: 14,
              marginTop: 14,
            }}
          >
            {providerMatches.map((provider) => {
              const parent = organizations.find(
                (entity) => entity.id === provider.parent_entity_id,
              );

              return (
                <Link
                  key={provider.id}
                  href={`/directory/doctor/${provider.slug}`}
                  className="card"
                  style={{
                    display: "block",
                    padding: 16,
                    textDecoration: "none",
                  }}
                >
                  <div className="eyebrow">provider</div>
                  <h3 style={{ margin: "10px 0 8px", fontSize: 20 }}>
                    {provider.name}
                  </h3>
                  {provider.specialty && (
                    <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>
                      {provider.specialty}
                    </p>
                  )}
                  {provider.location && (
                    <p style={{ margin: "0 0 8px", color: "var(--muted)" }}>
                      {provider.location}
                    </p>
                  )}
                  <RatingDisplay
                    value={Number(provider.average_rating || 0)}
                    count={provider.rating_count}
                  />
                  {parent && (
                    <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>
                      Works with {parent.name}
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <section className="container landing-trust-section">
        <article className="card landing-trust-card landing-reveal">
          <div className="section-head">
            <div>
              <h2 style={{ margin: 0 }}>Why healthcare teams choose OpenMD</h2>
              <p className="section-subtitle">
                Purpose-built workflows and transparent quality signals for
                modern care delivery.
              </p>
            </div>
          </div>

          <div className="landing-bullet-grid landing-bullet-grid-3">
            <div className="landing-bullet-item landing-bullet-card">
              <h3>Quality transparency</h3>
              <p>
                Review-backed profiles for organizations and provider networks,
                all in one place.
              </p>
            </div>
            <div className="landing-bullet-item landing-bullet-card">
              <h3>Operational control</h3>
              <p>
                Role-aware workflows for scheduling, credentialing, billing, and
                staffing decisions.
              </p>
            </div>
            <div className="landing-bullet-item landing-bullet-card">
              <h3>Faster decisions</h3>
              <p>
                Search by specialty and region, compare performance, and move
                from discovery to action in minutes.
              </p>
            </div>
          </div>

          <div className="landing-trust-graphic-row" aria-hidden="true">
            <div className="landing-trust-meter">
              <span className="landing-trust-meter-fill landing-trust-meter-fill-1" />
            </div>
            <div className="landing-trust-meter">
              <span className="landing-trust-meter-fill landing-trust-meter-fill-2" />
            </div>
            <div className="landing-trust-meter">
              <span className="landing-trust-meter-fill landing-trust-meter-fill-3" />
            </div>
          </div>
        </article>
      </section>
    </main>
  );
}
