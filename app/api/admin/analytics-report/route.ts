import { NextResponse } from "next/server";
import { getGlobalAdminAccess } from "@/lib/openmdAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export async function GET() {
  const access = await getGlobalAdminAccess();
  if (!access.isGlobalAdmin) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 403 });
  }

  const supabase = await createSupabaseServerClient();
  const [
    { count: totalReportsCount },
    { count: openReportsCount },
    { count: inReviewReportsCount },
    { count: resolvedReportsCount },
    { count: dismissedReportsCount },
    { data: reportAnalyticsRows },
    { data: tags },
  ] = await Promise.all([
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
    supabase
      .from("review_tag_options")
      .select("id,entity_type,slug,label,is_active"),
  ]);

  // Counts and rates for the report.
  const totalReports = totalReportsCount ?? 0;
  const openReports = openReportsCount ?? 0;
  const inReviewReports = inReviewReportsCount ?? 0;
  const resolvedReports = resolvedReportsCount ?? 0;
  const dismissedReports = dismissedReportsCount ?? 0;
  const pendingReports = openReports + inReviewReports;
  const moderatedReports = resolvedReports + dismissedReports;
  const moderationRate =
    totalReports > 0 ? (moderatedReports / totalReports) * 100 : 0;

  // Count report reasons.
  const reportReasonCounts = new Map<string, number>();
  for (const row of reportAnalyticsRows ?? []) {
    const key = String(row.reason || "Unknown");
    reportReasonCounts.set(key, (reportReasonCounts.get(key) ?? 0) + 1);
  }
  const topReasons = Array.from(reportReasonCounts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count)
    .slice(0, 5);

  // Assemble CSV output.
  const lines: string[] = [];
  lines.push("OpenMD Admin Analytics Report");
  lines.push(`Generated: ${new Date().toISOString()}`);
  lines.push("");

  // Key metrics
  lines.push("KEY METRICS");
  lines.push(`Total Reports,${totalReports}`);
  lines.push(`Open Reports,${openReports}`);
  lines.push(`In Review,${inReviewReports}`);
  lines.push(`Resolved,${resolvedReports}`);
  lines.push(`Dismissed,${dismissedReports}`);
  lines.push(`Pending Queue,${pendingReports}`);
  lines.push(`Moderated,${moderatedReports}`);
  lines.push(`Moderation Rate,${moderationRate.toFixed(1)}%`);
  lines.push("");

  // Status distribution
  lines.push("STATUS DISTRIBUTION");
  lines.push("Status,Count");
  lines.push(`Open,${openReports}`);
  lines.push(`In Review,${inReviewReports}`);
  lines.push(`Resolved,${resolvedReports}`);
  lines.push(`Dismissed,${dismissedReports}`);
  lines.push("");

  // Top report reasons
  lines.push("TOP REPORT REASONS");
  lines.push("Reason,Count");
  topReasons.forEach((item) => {
    lines.push(`"${item.label}",${item.count}`);
  });
  lines.push("");

  // Tag coverage
  const groupedTags = {
    doctor: (tags ?? []).filter((tag) => tag.entity_type === "doctor"),
    practice: (tags ?? []).filter((tag) => tag.entity_type === "practice"),
    facility: (tags ?? []).filter((tag) => tag.entity_type === "facility"),
  };
  lines.push("TAG COVERAGE");
  lines.push("Entity Type,Total Tags,Active Tags,Activation Rate");
  lines.push(
    `Doctor,${groupedTags.doctor.length},${groupedTags.doctor.filter((t) => t.is_active).length},${
      groupedTags.doctor.length > 0
        ? (
            (groupedTags.doctor.filter((t) => t.is_active).length /
              groupedTags.doctor.length) *
            100
          ).toFixed(1)
        : 0
    }%`,
  );
  lines.push(
    `Practice,${groupedTags.practice.length},${groupedTags.practice.filter((t) => t.is_active).length},${
      groupedTags.practice.length > 0
        ? (
            (groupedTags.practice.filter((t) => t.is_active).length /
              groupedTags.practice.length) *
            100
          ).toFixed(1)
        : 0
    }%`,
  );
  lines.push(
    `Facility,${groupedTags.facility.length},${groupedTags.facility.filter((t) => t.is_active).length},${
      groupedTags.facility.length > 0
        ? (
            (groupedTags.facility.filter((t) => t.is_active).length /
              groupedTags.facility.length) *
            100
          ).toFixed(1)
        : 0
    }%`,
  );

  const csv = lines.join("\n");

  return new NextResponse(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv",
      "Content-Disposition": `attachment; filename="analytics-report-${new Date().toISOString().split("T")[0]}.csv"`,
    },
  });
}
