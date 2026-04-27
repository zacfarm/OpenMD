import Link from "next/link";
import { notFound } from "next/navigation";

import { RatingDisplay } from "@/components/directory/RatingDisplay";
import { getActiveReviewTags } from "@/lib/directory";
import { formatTagLabel } from "@/lib/openmd";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const REPORT_REASONS = [
  { value: "privacy", label: "Privacy or identifying info" },
  { value: "spam", label: "Spam or promotional" },
  { value: "abusive", label: "Abusive or harassing" },
  { value: "fake_or_misleading", label: "Fake or misleading" },
  { value: "other", label: "Other" },
];

type PageEntity = {
  id: string;
  entity_type: "doctor" | "facility" | "practice";
  tenant_id: string | null;
  parent_entity_id: string | null;
  slug: string;
  name: string;
  specialty: string | null;
  location: string | null;
  description: string | null;
  average_rating: number;
  rating_count: number;
};

type Review = {
  id: string;
  star_rating: number;
  tags: string[] | null;
  comment: string | null;
  created_at: string;
};

type ProviderPreview = {
  id: string;
  parent_entity_id: string;
  slug: string;
  name: string;
  specialty: string | null;
  location: string | null;
  average_rating: number;
  rating_count: number;
};

function ReviewForm({
  entity,
  tagOptions,
}: {
  entity: PageEntity;
  tagOptions: Array<{ id: string; slug: string; label: string }>;
}) {
  return (
    <section className="card review-form-card" id="reviews">
      <div className="section-head">
        <div>
          <h2 style={{ margin: 0 }}>Leave an anonymous review</h2>
          <p className="review-form-warning">
            Public post: do not include PHI, diagnoses, DOB, insurance IDs, or
            personal identifiers.
          </p>
        </div>
        <div className="eyebrow">
          Reviewing{" "}
          {entity.entity_type === "doctor" ? "provider" : entity.entity_type}
        </div>
      </div>

      <div className="review-form-header-row">
        <div>
          <p className="review-form-title">Share your care experience</p>
          <p className="review-form-subtitle">
            Your feedback helps teams improve patient outcomes and operational
            quality.
          </p>
        </div>
        <div className="review-form-chip-wrap" aria-hidden="true">
          <span className="review-form-chip">Anonymous</span>
          <span className="review-form-chip">Moderated</span>
          <span className="review-form-chip">Public</span>
        </div>
      </div>

      <form action="/api/ratings" method="post" className="review-form-grid">
        <input type="hidden" name="entityId" value={entity.id} />

        <label className="review-form-label">
          <span>Star rating</span>
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
          <small className="review-form-hint">
            Choose the option that best represents your overall experience.
          </small>
        </label>

        {!!tagOptions.length && (
          <fieldset className="review-form-label" style={{ margin: 0 }}>
            <legend>
              <span>Tags (optional)</span>
            </legend>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
                gap: 8,
                marginTop: 8,
              }}
            >
              {tagOptions.map((tag) => (
                <label
                  key={tag.id}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    border: "1px solid var(--line)",
                    borderRadius: 10,
                    padding: "8px 10px",
                    background: "var(--surface-soft)",
                    cursor: "pointer",
                  }}
                >
                  <input type="checkbox" name="tags" value={tag.slug} />
                  <span>{tag.label}</span>
                </label>
              ))}
            </div>
            <small className="review-form-hint">
              Select one or more tags that match your experience.
            </small>
          </fieldset>
        )}

        <label className="review-form-label">
          <span>Comment (optional, 20-800 chars)</span>
          <textarea name="comment" className="field" rows={4} maxLength={800} />
        </label>

        <div className="review-form-actions">
          <button className="btn btn-primary" type="submit">
            Submit review
          </button>
          <p className="review-form-hint" style={{ margin: 0 }}>
            By submitting, you confirm this feedback is factual and
            policy-compliant.
          </p>
        </div>

        <button
          className="btn btn-primary review-form-mobile-submit"
          type="submit"
        >
          Submit review
        </button>
      </form>
    </section>
  );
}

function ReviewList({
  reviews,
  entityPath,
  tagLabelMap,
}: {
  reviews: Review[];
  entityPath: string;
  tagLabelMap: Map<string, string>;
}) {
  return (
    <section className="card review-list-card">
      <div className="section-head">
        <div>
          <h2 style={{ margin: 0 }}>Recent reviews</h2>
          <p className="section-subtitle">
            Most recent public feedback for this profile.
          </p>
        </div>
      </div>
      <div className="review-list-grid">
        {reviews.map((review) => (
          <article key={review.id} className="review-list-item">
            <div
              style={{
                display: "flex",
                justifyContent: "space-between",
                gap: 10,
                flexWrap: "wrap",
              }}
            >
              <RatingDisplay value={review.star_rating} size="sm" />
              <p style={{ margin: 0, color: "var(--muted)" }}>
                {new Date(review.created_at).toLocaleDateString("en-US", {
                  year: "numeric",
                  month: "short",
                  day: "numeric",
                })}
              </p>
            </div>
            {!!review.tags?.length && (
              <div className="tag-list" style={{ marginTop: 10 }}>
                {review.tags.map((tag) => (
                  <span className="tag-chip" key={tag}>
                    {tagLabelMap.get(tag) ?? formatTagLabel(tag)}
                  </span>
                ))}
              </div>
            )}
            {review.comment && (
              <p style={{ margin: "8px 0 0" }}>{review.comment}</p>
            )}

            <form
              action="/api/review-reports"
              method="post"
              className="review-report-form"
            >
              <input type="hidden" name="reviewId" value={review.id} />
              <input type="hidden" name="sourcePath" value={entityPath} />
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <select
                  name="reason"
                  className="field"
                  style={{ maxWidth: 280 }}
                  defaultValue="privacy"
                  required
                >
                  {REPORT_REASONS.map((reason) => (
                    <option key={reason.value} value={reason.value}>
                      Report: {reason.label}
                    </option>
                  ))}
                </select>
                <button className="btn btn-secondary" type="submit">
                  Report review
                </button>
              </div>
              <textarea
                className="field"
                name="details"
                rows={2}
                placeholder="Optional notes for OpenMD admins"
              />
            </form>
          </article>
        ))}

        {!reviews.length && (
          <p style={{ margin: 0, color: "var(--muted)" }}>No reviews yet.</p>
        )}
      </div>
    </section>
  );
}

export default async function DirectoryProfilePage({
  params,
  searchParams,
}: {
  params: Promise<{ entityType: string; slug: string }>;
  searchParams: Promise<{
    providerSearch?: string;
    providerSort?: string;
    showAll?: string;
  }>;
}) {
  const { entityType, slug } = await params;
  const supabase = await createSupabaseServerClient();

  const { data: entity } = await supabase
    .from("directory_entities")
    .select(
      "id,entity_type,tenant_id,parent_entity_id,slug,name,specialty,location,description,average_rating,rating_count",
    )
    .eq("entity_type", entityType)
    .eq("slug", slug)
    .single();

  if (!entity) notFound();

  const pageEntity = entity as PageEntity;

  const entityPath = `/directory/${pageEntity.entity_type}/${pageEntity.slug}`;
  const [tagOptions, reviewResult] = await Promise.all([
    getActiveReviewTags(pageEntity.entity_type),
    supabase
      .from("directory_reviews")
      .select("id,star_rating,tags,comment,created_at")
      .eq("entity_id", pageEntity.id)
      .order("created_at", { ascending: false })
      .limit(25),
  ]);

  const reviews = (reviewResult.data ?? []) as Review[];
  const tagLabelMap = new Map(tagOptions.map((tag) => [tag.slug, tag.label]));

  if (pageEntity.entity_type === "doctor") {
    const { data: parent } = pageEntity.parent_entity_id
      ? await supabase
          .from("directory_entities")
          .select("id,entity_type,slug,name")
          .eq("id", pageEntity.parent_entity_id)
          .maybeSingle()
      : { data: null };

    return (
      <main className="container" style={{ padding: "34px 0 40px" }}>
        <a href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>
          Back to directory
        </a>

        <section className="card" style={{ marginTop: 10, padding: 22 }}>
          <div
            style={{
              display: "flex",
              gap: 20,
              justifyContent: "space-between",
              flexWrap: "wrap",
            }}
          >
            <div>
              <div className="eyebrow">provider</div>
              <h1 style={{ margin: "4px 0 8px", fontSize: 34 }}>
                {pageEntity.name}
              </h1>
              {pageEntity.specialty && (
                <p style={{ margin: 0 }}>{pageEntity.specialty}</p>
              )}
              {pageEntity.location && (
                <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                  {pageEntity.location}
                </p>
              )}
            </div>
            <div className="rating-panel" style={{ minWidth: 250 }}>
              <RatingDisplay
                label="Provider rating"
                value={Number(pageEntity.average_rating || 0)}
                count={pageEntity.rating_count}
                size="lg"
              />
            </div>
          </div>

          {parent && (
            <p style={{ margin: "16px 0 0" }}>
              Works with{" "}
              <Link
                href={`/directory/${parent.entity_type}/${parent.slug}`}
                style={{ color: "var(--accent)" }}
              >
                {parent.name}
              </Link>
            </p>
          )}
          {pageEntity.description && (
            <p style={{ marginTop: 16 }}>{pageEntity.description}</p>
          )}
        </section>

        <ReviewForm entity={pageEntity} tagOptions={tagOptions} />
        <ReviewList
          reviews={reviews}
          entityPath={entityPath}
          tagLabelMap={tagLabelMap}
        />
      </main>
    );
  }

  const searchParamsData = await searchParams;
  const providerSearch = searchParamsData.providerSearch?.trim() ?? "";
  const providerSort = searchParamsData.providerSort?.trim() ?? "most_reviewed";
  const showAll = searchParamsData.showAll === "1";

  let providerQuery = supabase
    .from("directory_entities")
    .select(
      "id,parent_entity_id,slug,name,specialty,location,average_rating,rating_count",
    )
    .eq("entity_type", "doctor")
    .eq("parent_entity_id", pageEntity.id)
    .eq("is_active", true);

  if (providerSearch) {
    providerQuery = providerQuery.ilike("name", `%${providerSearch}%`);
  }

  if (providerSort === "name") {
    providerQuery = providerQuery.order("name", { ascending: true });
  } else if (providerSort === "top_rated") {
    providerQuery = providerQuery
      .order("average_rating", { ascending: false })
      .order("rating_count", { ascending: false });
  } else {
    providerQuery = providerQuery
      .order("rating_count", { ascending: false })
      .order("average_rating", { ascending: false });
  }

  if (!showAll) {
    providerQuery = providerQuery.limit(6);
  }

  const { data: providerResults } = await providerQuery;
  const linkedProviders = (providerResults ?? []) as ProviderPreview[];

  const { data: providerAggregateResults } = await supabase
    .from("directory_entities")
    .select("average_rating,rating_count")
    .eq("entity_type", "doctor")
    .eq("parent_entity_id", pageEntity.id)
    .eq("is_active", true);

  const providerAggregate = (providerAggregateResults ?? []).reduce(
    (acc, provider) => {
      acc.totalReviews += provider.rating_count ?? 0;
      acc.weightedAverage +=
        Number(provider.average_rating || 0) * (provider.rating_count ?? 0);
      return acc;
    },
    { totalReviews: 0, weightedAverage: 0 },
  );

  const providerAverage =
    providerAggregate.totalReviews > 0
      ? providerAggregate.weightedAverage / providerAggregate.totalReviews
      : null;

  return (
    <main className="container" style={{ padding: "34px 0 40px" }}>
      <a href="/" style={{ textDecoration: "none", color: "var(--muted)" }}>
        Back to directory
      </a>

      <section className="card" style={{ marginTop: 10, padding: 22 }}>
        <div
          style={{
            display: "flex",
            gap: 20,
            justifyContent: "space-between",
            flexWrap: "wrap",
          }}
        >
          <div>
            <div className="eyebrow">{pageEntity.entity_type}</div>
            <h1 style={{ margin: "4px 0 8px", fontSize: 34 }}>
              {pageEntity.name}
            </h1>
            {pageEntity.location && (
              <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                {pageEntity.location}
              </p>
            )}
          </div>
          <div className="summary-grid" style={{ minWidth: 280 }}>
            <div className="rating-panel">
              <RatingDisplay
                label="Organization rating"
                value={Number(pageEntity.average_rating || 0)}
                count={pageEntity.rating_count}
                size="lg"
              />
            </div>
            <div className="rating-panel">
              <RatingDisplay
                label="Provider network"
                value={providerAverage}
                count={providerAggregate.totalReviews}
                mutedWhenEmpty="No provider reviews yet"
              />
            </div>
          </div>
        </div>
        {pageEntity.description && (
          <p style={{ marginTop: 16 }}>{pageEntity.description}</p>
        )}
      </section>

      <section className="card" style={{ marginTop: 16, padding: 22 }}>
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
            <h2 style={{ margin: 0 }}>Linked providers</h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
              Browse individual provider ratings within this organization.
            </p>
          </div>
          <a href="#reviews" style={{ color: "var(--accent)" }}>
            Jump to organization reviews
          </a>
        </div>

        <form
          style={{
            marginTop: 14,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "2fr 1fr auto",
          }}
        >
          <input
            className="field"
            name="providerSearch"
            defaultValue={providerSearch}
            placeholder="Search providers by name"
          />
          <select
            className="field"
            name="providerSort"
            defaultValue={providerSort}
          >
            <option value="most_reviewed">Most reviewed</option>
            <option value="top_rated">Top rated</option>
            <option value="name">Name</option>
          </select>
          <button className="btn btn-secondary" type="submit">
            Update
          </button>
        </form>

        <div style={{ display: "grid", gap: 12, marginTop: 16 }}>
          {linkedProviders.map((provider) => (
            <Link
              key={provider.id}
              href={`/directory/doctor/${provider.slug}`}
              className="card"
              style={{ padding: 16, textDecoration: "none", borderRadius: 12 }}
            >
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <div>
                  <h3 style={{ margin: 0, fontSize: 20 }}>{provider.name}</h3>
                  {provider.specialty && (
                    <p style={{ margin: "6px 0 0", color: "var(--muted)" }}>
                      {provider.specialty}
                    </p>
                  )}
                  {provider.location && (
                    <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                      {provider.location}
                    </p>
                  )}
                </div>
                <div style={{ textAlign: "right" }}>
                  <RatingDisplay
                    value={Number(provider.average_rating || 0)}
                    count={provider.rating_count}
                  />
                </div>
              </div>
            </Link>
          ))}

          {!linkedProviders.length && (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              No linked providers yet.
            </p>
          )}
        </div>

        {!showAll && linkedProviders.length >= 6 && (
          <div style={{ marginTop: 14 }}>
            <Link
              href={`${entityPath}?providerSearch=${encodeURIComponent(providerSearch)}&providerSort=${encodeURIComponent(
                providerSort,
              )}&showAll=1`}
              style={{ color: "var(--accent)" }}
            >
              Show more providers
            </Link>
          </div>
        )}
      </section>

      <ReviewForm entity={pageEntity} tagOptions={tagOptions} />
      <ReviewList
        reviews={reviews}
        entityPath={entityPath}
        tagLabelMap={tagLabelMap}
      />
    </main>
  );
}
