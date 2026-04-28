import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { slugify } from "@/lib/openmd";
import { getGlobalAdminAccess } from "@/lib/openmdAdmin";
import { createSupabaseAdminClient } from "@/lib/supabaseAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

const ADMIN_NOTICE_MESSAGES: Record<string, string> = {
  report_saved: "Report status updated.",
  review_kept: "Review kept. Report marked as dismissed.",
  review_deleted: "Review deleted successfully.",
};

const ADMIN_ERROR_MESSAGES: Record<string, string> = {
  invalid_action: "Invalid moderation action.",
  missing_review: "The related review could not be found.",
  update_failed: "Could not save moderation changes.",
  delete_failed: "Could not delete the review.",
};

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
  const moderationAction = String(formData.get("moderationAction") || "");
  const reviewId = String(formData.get("reviewId") || "");
  const sourcePath = String(formData.get("sourcePath") || "").trim() || null;
  const entityPath = String(formData.get("entityPath") || "").trim() || null;
  const adminNotes = String(formData.get("adminNotes") || "").trim() || null;

  if (!id || !["open", "in_review", "resolved", "dismissed"].includes(status)) {
    redirect("/admin?error=invalid_action");
  }

  if (moderationAction && !["keep", "delete"].includes(moderationAction)) {
    redirect("/admin?error=invalid_action");
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (moderationAction === "delete") {
    if (!reviewId) {
      redirect("/admin?error=missing_review");
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data: reviewRow } = await supabaseAdmin
      .from("directory_reviews")
      .select("entity_id")
      .eq("id", reviewId)
      .maybeSingle();

    let resolvedEntityPath: string | null = entityPath;
    if (reviewRow?.entity_id) {
      const { data: entityRow } = await supabaseAdmin
        .from("directory_entities")
        .select("entity_type,slug")
        .eq("id", reviewRow.entity_id)
        .maybeSingle();

      if (entityRow?.entity_type && entityRow?.slug) {
        resolvedEntityPath = `/directory/${entityRow.entity_type}/${entityRow.slug}`;
      }
    }

    const { error: deleteError } = await supabaseAdmin
      .from("directory_reviews")
      .delete()
      .eq("id", reviewId);

    if (deleteError) {
      redirect("/admin?error=delete_failed");
    }

    revalidatePath("/admin");
    revalidatePath("/");
    if (sourcePath) {
      revalidatePath(sourcePath);
    }
    if (resolvedEntityPath && resolvedEntityPath !== sourcePath) {
      revalidatePath(resolvedEntityPath);
    }
    redirect("/admin?notice=review_deleted");
  }

  if (moderationAction === "keep") {
    const { error: keepError } = await supabase
      .from("directory_review_reports")
      .update({
        status: "dismissed",
        admin_notes:
          adminNotes ??
          "Reviewed by admin and kept. No policy violation found.",
        reviewed_by: user?.id ?? null,
        reviewed_at: new Date().toISOString(),
      })
      .eq("id", id);

    if (keepError) {
      redirect("/admin?error=update_failed");
    }

    revalidatePath("/admin");
    if (sourcePath) {
      revalidatePath(sourcePath);
    }
    if (entityPath && entityPath !== sourcePath) {
      revalidatePath(entityPath);
    }
    redirect("/admin?notice=review_kept");
  }

  const { error: saveError } = await supabase
    .from("directory_review_reports")
    .update({
      status,
      admin_notes: adminNotes,
      reviewed_by: user?.id ?? null,
      reviewed_at: new Date().toISOString(),
    })
    .eq("id", id);

  if (saveError) {
    redirect("/admin?error=update_failed");
  }

  revalidatePath("/admin");
  if (sourcePath) {
    revalidatePath(sourcePath);
  }
  if (entityPath && entityPath !== sourcePath) {
    revalidatePath(entityPath);
  }
  redirect("/admin?notice=report_saved");
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams?: Promise<{ notice?: string; error?: string }>;
}) {
  const access = await getGlobalAdminAccess();
  const resolvedSearchParams = (await searchParams) ?? {};
  const noticeMessage = resolvedSearchParams.notice
    ? (ADMIN_NOTICE_MESSAGES[resolvedSearchParams.notice] ?? null)
    : null;
  const errorMessage = resolvedSearchParams.error
    ? (ADMIN_ERROR_MESSAGES[resolvedSearchParams.error] ?? null)
    : null;

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

  const reportStatusMeta: Record<
    "open" | "in_review" | "resolved" | "dismissed",
    { label: string; fg: string; bg: string; border: string }
  > = {
    open: {
      label: "Open",
      fg: "#9a4d12",
      bg: "#fff4e8",
      border: "#f3cda8",
    },
    in_review: {
      label: "In review",
      fg: "#1b5b86",
      bg: "#edf6ff",
      border: "#b8d9f5",
    },
    resolved: {
      label: "Resolved",
      fg: "#0d6b50",
      bg: "#ebf9f2",
      border: "#b5e6d3",
    },
    dismissed: {
      label: "Dismissed",
      fg: "#4e6270",
      bg: "#f2f5f7",
      border: "#d2dce2",
    },
  };

  return (
    <section style={{ display: "grid", gap: 16 }}>
      <article className="card" style={{ padding: 22 }}>
        <h1 style={{ marginTop: 0 }}>Global admin</h1>
        <p style={{ color: "var(--muted)" }}>
          Manage public review taxonomy and investigate reported reviews across
          the full OpenMD directory.
        </p>
      </article>

      {(noticeMessage || errorMessage) && (
        <article
          className="card"
          style={{
            padding: 16,
            borderColor: errorMessage ? "#b44a2e66" : "#0f816066",
            background: errorMessage ? "#fff6f4" : "#f2fbf8",
          }}
        >
          {noticeMessage && (
            <p style={{ margin: 0, color: "#0f8160", fontWeight: 600 }}>
              {noticeMessage}
            </p>
          )}
          {errorMessage && (
            <p style={{ margin: 0, color: "#b44a2e", fontWeight: 600 }}>
              {errorMessage}
            </p>
          )}
        </article>
      )}

      <article className="card analytics-card">
        <div className="section-head">
          <div>
            <h2 style={{ margin: 0 }}>Admin Analytics</h2>
            <p className="section-subtitle">
              Moderation workload, report trends, and tag coverage across the
              directory.
            </p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <p style={{ margin: 0, color: "var(--muted)" }}>
              {compactNumber.format(totalReports)} total reports
            </p>
            <a
              href="/api/admin/analytics-report"
              className="btn btn-secondary"
              style={{ textDecoration: "none" }}
              download
            >
              Download Report
            </a>
          </div>
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
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <svg
                  width="180"
                  height="180"
                  viewBox="0 0 180 180"
                  style={{ margin: "0 auto", display: "block" }}
                >
                  {(() => {
                    const total = statusBuckets.reduce(
                      (sum, item) => sum + item.count,
                      0,
                    );
                    if (total === 0) {
                      return <circle cx="90" cy="90" r="70" fill="#e5e5e5" />;
                    }

                    let currentAngle = -Math.PI / 2;
                    return statusBuckets.map((item, index) => {
                      const sliceAngle = (item.count / total) * 2 * Math.PI;
                      const startAngle = currentAngle;
                      const endAngle = currentAngle + sliceAngle;

                      const x1 = 90 + 70 * Math.cos(startAngle);
                      const y1 = 90 + 70 * Math.sin(startAngle);
                      const x2 = 90 + 70 * Math.cos(endAngle);
                      const y2 = 90 + 70 * Math.sin(endAngle);

                      const largeArc = sliceAngle > Math.PI ? 1 : 0;

                      const pathData = [
                        `M 90 90`,
                        `L ${x1} ${y1}`,
                        `A 70 70 0 ${largeArc} 1 ${x2} ${y2}`,
                        "Z",
                      ].join(" ");

                      currentAngle = endAngle;

                      return (
                        <path
                          key={item.label}
                          d={pathData}
                          fill={item.color}
                          stroke="white"
                          strokeWidth="2"
                        />
                      );
                    });
                  })()}
                </svg>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {statusBuckets.map((item) => (
                  <div
                    key={item.label}
                    style={{ display: "flex", gap: 8, alignItems: "center" }}
                  >
                    <div
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        backgroundColor: item.color,
                        flexShrink: 0,
                      }}
                    />
                    <span style={{ fontSize: 13, color: "var(--muted)" }}>
                      {item.label}
                    </span>
                    <strong style={{ marginLeft: "auto" }}>{item.count}</strong>
                  </div>
                ))}
              </div>
            </div>
          </article>

          <article className="analytics-chart-card">
            <h3 style={{ margin: "0 0 12px" }}>Status Bars</h3>
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
            <h3 style={{ margin: "0 0 12px" }}>Report Reasons Distribution</h3>
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
            <h3 style={{ margin: "0 0 12px" }}>Tag Coverage Overview</h3>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 16,
              }}
            >
              <div>
                <svg
                  width="180"
                  height="180"
                  viewBox="0 0 180 180"
                  style={{ margin: "0 auto", display: "block" }}
                >
                  {(() => {
                    const total = tagTypeCoverage.reduce(
                      (sum, item) => sum + item.total,
                      0,
                    );
                    if (total === 0) {
                      return <circle cx="90" cy="90" r="70" fill="#e5e5e5" />;
                    }

                    const colors = ["#06b6d4", "#8b5cf6", "#f59e0b"];
                    let currentAngle = -Math.PI / 2;

                    return tagTypeCoverage.map((item, index) => {
                      const sliceAngle = (item.total / total) * 2 * Math.PI;
                      const startAngle = currentAngle;
                      const endAngle = currentAngle + sliceAngle;

                      const x1 = 90 + 70 * Math.cos(startAngle);
                      const y1 = 90 + 70 * Math.sin(startAngle);
                      const x2 = 90 + 70 * Math.cos(endAngle);
                      const y2 = 90 + 70 * Math.sin(endAngle);

                      const largeArc = sliceAngle > Math.PI ? 1 : 0;

                      const pathData = [
                        `M 90 90`,
                        `L ${x1} ${y1}`,
                        `A 70 70 0 ${largeArc} 1 ${x2} ${y2}`,
                        "Z",
                      ].join(" ");

                      currentAngle = endAngle;

                      return (
                        <path
                          key={item.label}
                          d={pathData}
                          fill={colors[index % colors.length]}
                          stroke="white"
                          strokeWidth="2"
                        />
                      );
                    });
                  })()}
                </svg>
              </div>
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  justifyContent: "center",
                  gap: 8,
                }}
              >
                {tagTypeCoverage.map((item, index) => {
                  const colors = ["#06b6d4", "#8b5cf6", "#f59e0b"];
                  const percentage =
                    item.total > 0 ? (item.active / item.total) * 100 : 0;
                  return (
                    <div
                      key={item.label}
                      style={{
                        display: "flex",
                        flexDirection: "column",
                        gap: 4,
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          gap: 8,
                          alignItems: "center",
                        }}
                      >
                        <div
                          style={{
                            width: 12,
                            height: 12,
                            borderRadius: 3,
                            backgroundColor: colors[index % colors.length],
                            flexShrink: 0,
                          }}
                        />
                        <span style={{ fontSize: 13, color: "var(--muted)" }}>
                          {item.label}
                        </span>
                        <strong style={{ marginLeft: "auto" }}>
                          {item.active}/{item.total}
                        </strong>
                      </div>
                      <div
                        style={{
                          fontSize: 12,
                          color: "var(--muted)",
                          marginLeft: 20,
                        }}
                      >
                        {percentage.toFixed(1)}% active
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </article>
        </div>
      </article>

      <article className="card admin-reports-card">
        <div className="admin-reports-head">
          <div>
            <h2 style={{ marginTop: 0 }}>Reported reviews</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Prioritize open reports, review context, then keep or remove
              public reviews.
            </p>
          </div>
          <div className="admin-report-status-chips" aria-hidden="true">
            <span className="admin-report-chip admin-report-chip-open">
              Open {openReports}
            </span>
            <span className="admin-report-chip admin-report-chip-review">
              In review {inReviewReports}
            </span>
            <span className="admin-report-chip admin-report-chip-resolved">
              Resolved {resolvedReports}
            </span>
            <span className="admin-report-chip admin-report-chip-dismissed">
              Dismissed {dismissedReports}
            </span>
          </div>
        </div>
        <div className="admin-reports-list">
          {(reports ?? []).map((report) => {
            const relatedReview = Array.isArray(report.directory_reviews)
              ? report.directory_reviews[0]
              : report.directory_reviews;
            const relatedEntity = Array.isArray(
              relatedReview?.directory_entities,
            )
              ? relatedReview?.directory_entities[0]
              : relatedReview?.directory_entities;
            const statusKey = (
              ["open", "in_review", "resolved", "dismissed"].includes(
                report.status,
              )
                ? report.status
                : "open"
            ) as "open" | "in_review" | "resolved" | "dismissed";
            const statusUi = reportStatusMeta[statusKey];

            return (
              <form
                key={report.id}
                action={updateReportStatus}
                className="admin-report-item"
              >
                <input type="hidden" name="id" value={report.id} />
                <input type="hidden" name="reviewId" value={report.review_id} />
                <input
                  type="hidden"
                  name="sourcePath"
                  value={report.source_path ?? ""}
                />
                <input
                  type="hidden"
                  name="entityPath"
                  value={
                    relatedEntity
                      ? `/directory/${relatedEntity.entity_type}/${relatedEntity.slug}`
                      : ""
                  }
                />
                <div className="admin-report-topline">
                  <div>
                    <div className="admin-report-badges">
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          border: `1px solid ${statusUi.border}`,
                          color: statusUi.fg,
                          background: statusUi.bg,
                        }}
                      >
                        {statusUi.label}
                      </span>
                      <span
                        style={{
                          padding: "4px 10px",
                          borderRadius: 999,
                          fontSize: 12,
                          fontWeight: 700,
                          color: "#6a7280",
                          background: "#eef1f4",
                          border: "1px solid #d8dee5",
                        }}
                      >
                        Reason: {report.reason}
                      </span>
                    </div>
                    <p className="admin-report-time">
                      {new Date(report.created_at).toLocaleString("en-US", {
                        year: "numeric",
                        month: "short",
                        day: "numeric",
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    </p>
                  </div>
                  <div className="admin-report-entity">
                    {relatedEntity ? (
                      <a
                        href={`/directory/${relatedEntity.entity_type}/${relatedEntity.slug}`}
                        className="admin-report-entity-link"
                      >
                        {relatedEntity.name}
                      </a>
                    ) : (
                      "Unknown entity"
                    )}
                  </div>
                </div>

                {relatedReview && (
                  <div className="admin-report-review-box">
                    <div className="admin-report-review-meta">
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        Review rating: {relatedReview.star_rating} / 5
                      </p>
                      <p style={{ margin: 0, color: "var(--muted)" }}>
                        Review ID: {relatedReview.id}
                      </p>
                    </div>
                    {relatedReview.comment && (
                      <p style={{ margin: "8px 0 0" }}>
                        {relatedReview.comment}
                      </p>
                    )}
                  </div>
                )}

                {report.details && (
                  <div className="admin-report-details-box">
                    <p
                      style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}
                    >
                      Reporter details
                    </p>
                    <p style={{ margin: "4px 0 0" }}>{report.details}</p>
                  </div>
                )}

                <div className="admin-report-controls">
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

                <div className="admin-report-actions">
                  <button
                    className="btn btn-secondary"
                    type="submit"
                    name="moderationAction"
                    value="keep"
                  >
                    Keep Review
                  </button>
                  <button
                    className="btn btn-primary"
                    style={{ background: "#b44a2e" }}
                    type="submit"
                    name="moderationAction"
                    value="delete"
                    disabled={!relatedReview}
                  >
                    Delete Review
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

      <article className="card admin-tags-card">
        <div className="admin-tags-head">
          <div>
            <h2 style={{ marginTop: 0 }}>Review tags</h2>
            <p style={{ color: "var(--muted)", marginTop: 0 }}>
              Tags are scoped by entity type so provider reviews and
              organization reviews stay distinct.
            </p>
          </div>
          <div className="admin-tag-coverage-pills" aria-hidden="true">
            {tagTypeCoverage.map((item) => (
              <span key={item.label} className="admin-tag-coverage-pill">
                {item.label}: {item.active}/{item.total}
              </span>
            ))}
          </div>
        </div>

        <form action={createTagOption} className="admin-tag-create-form">
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

        <div className="admin-tag-groups">
          {(["doctor", "practice", "facility"] as const).map((entityType) => (
            <section key={entityType} className="admin-tag-group">
              <div className="admin-tag-group-head">
                <h3 style={{ margin: 0, textTransform: "capitalize" }}>
                  {entityType} tags
                </h3>
                <span className="admin-tag-group-count">
                  {groupedTags[entityType].length} total
                </span>
              </div>
              <div className="admin-tag-items">
                {groupedTags[entityType].map((tag) => (
                  <form
                    key={tag.id}
                    action={updateTagStatus}
                    className="admin-tag-item"
                  >
                    <input type="hidden" name="id" value={tag.id} />
                    <div className="admin-tag-item-main">
                      <strong>{tag.label}</strong>
                      <span style={{ color: "var(--muted)" }}>{tag.slug}</span>
                    </div>
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
            </section>
          ))}
        </div>
      </article>
    </section>
  );
}
