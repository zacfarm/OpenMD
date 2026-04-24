import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { slugify } from "@/lib/openmd";
import { getGlobalAdminAccess } from "@/lib/openmdAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

async function claimGlobalAdmin() {
  "use server";

  const supabase = await createSupabaseServerClient();
  const access = await getGlobalAdminAccess();

  if (!access.userId || !access.needsBootstrap) {
    redirect("/admin");
  }

  await supabase.from("global_admins").insert({ user_id: access.userId });
  revalidatePath("/admin");
  redirect("/admin");
}

async function createTagOption(formData: FormData) {
  "use server";

  const access = await getGlobalAdminAccess();
  if (!access.isGlobalAdmin) {
    redirect("/dashboard");
  }

  const entityType = String(formData.get("entityType") || "");
  const label = String(formData.get("label") || "").trim();
  const slugInput = String(formData.get("slug") || "").trim();
  const slug = slugify(slugInput || label);

  if (
    !label ||
    !slug ||
    !["doctor", "practice", "facility"].includes(entityType)
  ) {
    redirect("/admin");
  }

  const supabase = await createSupabaseServerClient();
  const { data: existing } = await supabase
    .from("review_tag_options")
    .select("sort_order")
    .eq("entity_type", entityType)
    .order("sort_order", { ascending: false })
    .limit(1)
    .maybeSingle();

  await supabase.from("review_tag_options").upsert({
    entity_type: entityType,
    slug,
    label,
    sort_order: (existing?.sort_order ?? 0) + 10,
    is_active: true,
  });

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

async function updateTagStatus(formData: FormData) {
  "use server";

  const access = await getGlobalAdminAccess();
  if (!access.isGlobalAdmin) {
    redirect("/dashboard");
  }

  const id = String(formData.get("id") || "");
  const isActive = String(formData.get("isActive") || "") === "true";
  if (!id) redirect("/admin");

  const supabase = await createSupabaseServerClient();
  await supabase
    .from("review_tag_options")
    .update({ is_active: isActive })
    .eq("id", id);

  revalidatePath("/admin");
  revalidatePath("/");
  redirect("/admin");
}

async function updateReportStatus(formData: FormData) {
  "use server";

  const access = await getGlobalAdminAccess();
  if (!access.isGlobalAdmin) {
    redirect("/dashboard");
  }

  const id = String(formData.get("id") || "");
  const status = String(formData.get("status") || "");
  const adminNotes = String(formData.get("adminNotes") || "").trim() || null;

  if (!id || !["open", "in_review", "resolved", "dismissed"].includes(status)) {
    redirect("/admin");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  await supabase
    .from("directory_review_reports")
    .update({
      status,
      admin_notes: adminNotes,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  revalidatePath("/admin");
  redirect("/admin");
}

export default async function AdminPage() {
  const access = await getGlobalAdminAccess();

  if (!access.isGlobalAdmin && !access.needsBootstrap) {
    redirect("/dashboard");
  }

  if (!access.isGlobalAdmin && access.needsBootstrap) {
    return (
      <section className="card" style={{ padding: 22, maxWidth: 720 }}>
        <h1 style={{ marginTop: 0 }}>Initialize OpenMD admin</h1>
        <p style={{ color: "var(--muted)" }}>
          No global admins exist yet. Claim the first admin seat to manage
          review reports and public review tags.
        </p>
        <form action={claimGlobalAdmin}>
          <button className="btn btn-primary" type="submit">
            Claim global admin access
          </button>
        </form>
      </section>
    );
  }

  const supabase = await createSupabaseServerClient();
  const [
    { data: tags },
    { data: reports },
    { count: totalReportsCount },
    { count: openReportsCount },
    { count: inReviewReportsCount },
    { count: resolvedReportsCount },
    { count: dismissedReportsCount },
    { data: reportAnalyticsRows },
  ] = await Promise.all([
    supabase
      .from("review_tag_options")
      .select("id,entity_type,slug,label,sort_order,is_active")
      .order("entity_type", { ascending: true })
      .order("sort_order", { ascending: true }),
    supabase
      .from("directory_review_reports")
      .select(
        "id,reason,details,source_path,status,admin_notes,created_at,review_id,directory_reviews(id,star_rating,comment,entity_id,directory_entities(name,slug,entity_type))",
      )
      .order("created_at", { ascending: false })
      .limit(50),
    supabase
      .from("directory_review_reports")
      .select("id", { count: "exact", head: true }),
    supabase
      .from("directory_review_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "open"),
    supabase
      .from("directory_review_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "in_review"),
    supabase
      .from("directory_review_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "resolved"),
    supabase
      .from("directory_review_reports")
      .select("id", { count: "exact", head: true })
      .eq("status", "dismissed"),
    supabase
      .from("directory_review_reports")
      .select("reason,created_at,status")
      .order("created_at", { ascending: false })
      .limit(400),
  ]);

  const groupedTags = {
    doctor: (tags ?? []).filter((tag) => tag.entity_type === "doctor"),
    practice: (tags ?? []).filter((tag) => tag.entity_type === "practice"),
    facility: (tags ?? []).filter((tag) => tag.entity_type === "facility"),
  };

  const totalReports = totalReportsCount ?? 0;
  const openReports = openReportsCount ?? 0;
  const inReviewReports = inReviewReportsCount ?? 0;
  const resolvedReports = resolvedReportsCount ?? 0;
  const dismissedReports = dismissedReportsCount ?? 0;
  const pendingReports = openReports + inReviewReports;
  const moderatedReports = resolvedReports + dismissedReports;
  const moderationRate =
    totalReports > 0 ? (moderatedReports / totalReports) * 100 : 0;

  const statusBuckets = [
    { label: "Open", count: openReports, color: "#bf6c2f" },
    { label: "In review", count: inReviewReports, color: "#22749f" },
    { label: "Resolved", count: resolvedReports, color: "#188563" },
    { label: "Dismissed", count: dismissedReports, color: "#6d7f8d" },
  ];
  const maxStatusCount = Math.max(
    ...statusBuckets.map((item) => item.count),
    1,
  );

  const reportReasonCounts = new Map<string, number>();
  for (const row of reportAnalyticsRows ?? []) {
    const key = String(row.reason || "Unknown");
    reportReasonCounts.set(key, (reportReasonCounts.get(key) ?? 0) + 1);
  }
  const topReasons = Array.from(reportReasonCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);
  const maxReasonCount = Math.max(...topReasons.map((item) => item.count), 1);

  const now = new Date();
  const reportTrend = Array.from({ length: 7 }, (_, index) => {
    const day = new Date(now);
    day.setDate(now.getDate() - (6 - index));
    const key = day.toISOString().slice(0, 10);
    return {
      key,
      label: day.toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
      }),
      count: 0,
    };
  });
  const trendIndexByKey = new Map(
    reportTrend.map((item, index) => [item.key, index]),
  );
  for (const row of reportAnalyticsRows ?? []) {
    const dayKey = String(row.created_at || "").slice(0, 10);
    const idx = trendIndexByKey.get(dayKey);
    if (typeof idx === "number") {
      reportTrend[idx].count += 1;
    }
  }
  const maxTrendCount = Math.max(...reportTrend.map((item) => item.count), 1);

  const tagTypeCoverage = [
    {
      label: "Doctor tags",
      total: groupedTags.doctor.length,
      active: groupedTags.doctor.filter((tag) => tag.is_active).length,
    },
    {
      label: "Practice tags",
      total: groupedTags.practice.length,
      active: groupedTags.practice.filter((tag) => tag.is_active).length,
    },
    {
      label: "Facility tags",
      total: groupedTags.facility.length,
      active: groupedTags.facility.filter((tag) => tag.is_active).length,
    },
  ];

  const compactNumber = new Intl.NumberFormat("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <article className="card" style={{ padding: 22 }}>
        <h1 style={{ marginTop: 0 }}>Global admin</h1>
        <p style={{ color: "var(--muted)" }}>
          Manage public review taxonomy and investigate reported reviews across
          the full OpenMD directory.
        </p>
      </article>

      <article className="card analytics-card">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>Admin Analytics</h2>
            <p className="section-subtitle">
              Moderation workload, report trends, and tag coverage across the
              directory.
            </p>
          </div>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            {compactNumber.format(totalReports)} total reports
          </p>
        </div>

        <div className="analytics-kpi-grid">
          <article className="dashboard-mini-stat">
            <p className="metric-label">Open Reports</p>
            <p className="metric-value">{openReports}</p>
            <p className="metric-hint">Need immediate review</p>
          </article>
          <article className="dashboard-mini-stat">
            <p className="metric-label">Pending Queue</p>
            <p className="metric-value">{pendingReports}</p>
            <p className="metric-hint">Open + in review</p>
          </article>
          <article className="dashboard-mini-stat">
            <p className="metric-label">Moderated</p>
            <p className="metric-value">{moderatedReports}</p>
            <p className="metric-hint">Resolved + dismissed</p>
          </article>
          <article className="dashboard-mini-stat">
            <p className="metric-label">Moderation Rate</p>
            <p className="metric-value">{moderationRate.toFixed(1)}%</p>
            <p className="metric-hint">Share of reports with final outcome</p>
          </article>
        </div>

        <div className="analytics-chart-grid">
          <article className="analytics-chart-card">
            <h3 style={{ margin: "0 0 12px" }}>Status Distribution</h3>
            <div className="analytics-bar-list">
              {statusBuckets.map((item) => (
                <div key={item.label} className="analytics-bar-row">
                  <div className="analytics-bar-topline">
                    <span>{item.label}</span>
                    <strong>{item.count}</strong>
                  </div>
                  <div className="analytics-bar-track" aria-hidden="true">
                    <span
                      className="analytics-bar-fill"
                      style={{
                        width: `${(item.count / maxStatusCount) * 100}%`,
                        backgroundColor: item.color,
                      }}
                    />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="analytics-chart-card">
            <h3 style={{ margin: "0 0 12px" }}>Top Report Reasons</h3>
            {!!topReasons.length ? (
              <div className="analytics-bar-list">
                {topReasons.map((item) => (
                  <div key={item.label} className="analytics-bar-row">
                    <div className="analytics-bar-topline">
                      <span
                        style={{
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                        }}
                      >
                        {item.label}
                      </span>
                      <strong>{item.count}</strong>
                    </div>
                    <div className="analytics-bar-track" aria-hidden="true">
                      <span
                        className="analytics-bar-fill"
                        style={{
                          width: `${(item.count / maxReasonCount) * 100}%`,
                          backgroundColor: "#5f6bd4",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p style={{ margin: 0, color: "var(--muted)" }}>
                No report reasons available yet.
              </p>
            )}
          </article>

          <article className="analytics-chart-card">
            <h3 style={{ margin: "0 0 12px" }}>Reports Last 7 Days</h3>
            <div
              className="analytics-trend-wrap"
              role="img"
              aria-label="Column chart of reports created over the past seven days"
            >
              {reportTrend.map((item) => (
                <div key={item.key} className="analytics-trend-item">
                  <div className="analytics-column-value">{item.count}</div>
                  <div className="analytics-trend-track" aria-hidden="true">
                    <div
                      className="analytics-column-fill"
                      style={{
                        height: `${(item.count / maxTrendCount) * 100}%`,
                        backgroundColor: "#0f8160",
                      }}
                    />
                  </div>
                  <div className="analytics-column-label">{item.label}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="analytics-chart-card">
            <h3 style={{ margin: "0 0 12px" }}>Tag Activation Coverage</h3>
            <div className="analytics-bar-list">
              {tagTypeCoverage.map((item) => {
                const percentage =
                  item.total > 0 ? (item.active / item.total) * 100 : 0;

                return (
                  <div key={item.label} className="analytics-bar-row">
                    <div className="analytics-bar-topline">
                      <span>{item.label}</span>
                      <strong>
                        {item.active}/{item.total}
                      </strong>
                    </div>
                    <div className="analytics-bar-track" aria-hidden="true">
                      <span
                        className="analytics-bar-fill"
                        style={{
                          width: `${percentage}%`,
                          backgroundColor: "#3f9a7b",
                        }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </article>
        </div>
      </article>

      <article className="card" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Review tags</h2>
        <p style={{ color: "var(--muted)" }}>
          Tags are scoped by entity type so provider reviews and organization
          reviews stay distinct.
        </p>

        <form
          action={createTagOption}
          style={{
            display: "grid",
            gap: 10,
            gridTemplateColumns: "1fr 1fr 1fr auto",
          }}
        >
          <select className="field" name="entityType" defaultValue="doctor">
            <option value="doctor">Doctor</option>
            <option value="practice">Practice</option>
            <option value="facility">Facility</option>
          </select>
          <input
            className="field"
            name="label"
            placeholder="Visible tag label"
            required
          />
          <input
            className="field"
            name="slug"
            placeholder="Optional slug override"
          />
          <button className="btn btn-primary" type="submit">
            Add tag
          </button>
        </form>

        <div style={{ display: "grid", gap: 14, marginTop: 18 }}>
          {(["doctor", "practice", "facility"] as const).map((entityType) => (
            <div key={entityType}>
              <h3 style={{ marginBottom: 8, textTransform: "capitalize" }}>
                {entityType} tags
              </h3>
              <div style={{ display: "grid", gap: 8 }}>
                {groupedTags[entityType].map((tag) => (
                  <form
                    key={tag.id}
                    action={updateTagStatus}
                    style={{
                      display: "grid",
                      gap: 10,
                      gridTemplateColumns: "1.2fr 1fr 1fr auto",
                      alignItems: "center",
                      borderTop: "1px solid var(--line)",
                      paddingTop: 10,
                    }}
                  >
                    <input type="hidden" name="id" value={tag.id} />
                    <div>
                      <strong>{tag.label}</strong>
                    </div>
                    <div style={{ color: "var(--muted)" }}>{tag.slug}</div>
                    <select
                      className="field"
                      name="isActive"
                      defaultValue={String(tag.is_active)}
                    >
                      <option value="true">Active</option>
                      <option value="false">Inactive</option>
                    </select>
                    <button className="btn btn-secondary" type="submit">
                      Save
                    </button>
                  </form>
                ))}
              </div>
            </div>
          ))}
        </div>
      </article>

      <article className="card" style={{ padding: 22 }}>
        <h2 style={{ marginTop: 0 }}>Reported reviews</h2>
        <div style={{ display: "grid", gap: 14 }}>
          {(reports ?? []).map((report) => {
            const relatedReview = Array.isArray(report.directory_reviews)
              ? report.directory_reviews[0]
              : report.directory_reviews;
            const relatedEntity = Array.isArray(
              relatedReview?.directory_entities,
            )
              ? relatedReview?.directory_entities[0]
              : relatedReview?.directory_entities;

            return (
              <form
                key={report.id}
                action={updateReportStatus}
                style={{
                  display: "grid",
                  gap: 10,
                  borderTop: "1px solid var(--line)",
                  paddingTop: 12,
                }}
              >
                <input type="hidden" name="id" value={report.id} />
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    gap: 12,
                    flexWrap: "wrap",
                  }}
                >
                  <div>
                    <strong>{report.reason}</strong>
                    <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
                      {new Date(report.created_at).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div style={{ color: "var(--muted)" }}>
                    {relatedEntity ? (
                      <a
                        href={`/directory/${relatedEntity.entity_type}/${relatedEntity.slug}`}
                        style={{ color: "var(--accent)" }}
                      >
                        {relatedEntity.name}
                      </a>
                    ) : (
                      "Unknown entity"
                    )}
                  </div>
                </div>

                {relatedReview && (
                  <div
                    style={{
                      background: "#f7fbf9",
                      border: "1px solid var(--line)",
                      borderRadius: 12,
                      padding: 12,
                    }}
                  >
                    <p style={{ margin: 0, fontWeight: 700 }}>
                      {relatedReview.star_rating} / 5
                    </p>
                    {relatedReview.comment && (
                      <p style={{ margin: "8px 0 0" }}>
                        {relatedReview.comment}
                      </p>
                    )}
                  </div>
                )}

                {report.details && (
                  <p style={{ margin: 0 }}>{report.details}</p>
                )}

                <div
                  style={{
                    display: "grid",
                    gap: 10,
                    gridTemplateColumns: "1fr 2fr auto",
                  }}
                >
                  <select
                    className="field"
                    name="status"
                    defaultValue={report.status}
                  >
                    <option value="open">Open</option>
                    <option value="in_review">In review</option>
                    <option value="resolved">Resolved</option>
                    <option value="dismissed">Dismissed</option>
                  </select>
                  <input
                    className="field"
                    name="adminNotes"
                    defaultValue={report.admin_notes ?? ""}
                    placeholder="Admin notes"
                  />
                  <button className="btn btn-secondary" type="submit">
                    Save
                  </button>
                </div>
              </form>
            );
          })}

          {!reports?.length && (
            <p style={{ margin: 0, color: "var(--muted)" }}>No reports yet.</p>
          )}
        </div>
      </article>
    </section>
  );
}
