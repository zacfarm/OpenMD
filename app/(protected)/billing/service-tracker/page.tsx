import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

export default async function BillingServiceTrackerPage({
  searchParams,
}: {
  searchParams?: Promise<{ eventId?: string; claimId?: string }>;
}) {
  const resolvedSearchParams = await searchParams;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id,role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!membership || !hasPermission(membership.role, "view_billing")) {
    redirect("/dashboard");
  }

  const [claimsRes, recentScheduleEventsRes] = await Promise.all([
    supabase
      .from("insurance_claims")
      .select("id,status")
      .eq("tenant_id", membership.tenant_id),
    supabase
      .from("schedule_events")
      .select(
        "id,case_identifier,patient_display_name,title,starts_at,status,billing_claim_id,visit_type,tenant_schedule_insurance_companies(name,payer_code)",
      )
      .eq("tenant_id", membership.tenant_id)
      .order("starts_at", { ascending: false })
      .limit(60),
  ]);

  const activeEvent = resolvedSearchParams?.eventId
    ? await supabase
        .from("schedule_events")
        .select(
          "id,title,case_identifier,patient_display_name,starts_at,status,billing_claim_id,visit_type,tenant_schedule_insurance_companies(name,payer_code)",
        )
        .eq("id", resolvedSearchParams.eventId)
        .eq("tenant_id", membership.tenant_id)
        .maybeSingle()
    : { data: null };

  const claims = (claimsRes.data ?? []) as Array<{
    id: string;
    status: string;
  }>;
  const claimById = new Map(claims.map((claim) => [claim.id, claim.status]));

  const recentScheduleEvents = (recentScheduleEventsRes.data ?? []) as Array<{
    id: string;
    case_identifier: string | null;
    patient_display_name: string | null;
    title: string;
    starts_at: string;
    status:
      | "scheduled"
      | "confirmed"
      | "in_progress"
      | "completed"
      | "cancelled";
    billing_claim_id: string | null;
    visit_type: "inpatient" | "outpatient" | null;
    tenant_schedule_insurance_companies:
      | { name: string; payer_code: string | null }
      | { name: string; payer_code: string | null }[]
      | null;
  }>;

  const activeEventData = (activeEvent.data ?? null) as {
    id: string;
    title: string;
    case_identifier: string | null;
    patient_display_name: string | null;
    starts_at: string;
    status:
      | "scheduled"
      | "confirmed"
      | "in_progress"
      | "completed"
      | "cancelled";
    billing_claim_id: string | null;
    visit_type: "inpatient" | "outpatient" | null;
    tenant_schedule_insurance_companies:
      | { name: string; payer_code: string | null }
      | { name: string; payer_code: string | null }[]
      | null;
  } | null;

  const rows = activeEventData
    ? [
        activeEventData,
        ...recentScheduleEvents.filter(
          (event) => event.id !== activeEventData.id,
        ),
      ]
    : recentScheduleEvents;

  const getCoverageLabel = (event: {
    tenant_schedule_insurance_companies:
      | { name: string; payer_code: string | null }
      | { name: string; payer_code: string | null }[]
      | null;
  }) => {
    const coverage = Array.isArray(event.tenant_schedule_insurance_companies)
      ? event.tenant_schedule_insurance_companies[0]
      : event.tenant_schedule_insurance_companies;
    if (!coverage) return "No insurance provided";
    return coverage.payer_code
      ? `${coverage.name} (${coverage.payer_code})`
      : coverage.name;
  };

  const getBillingStatusLabel = (event: {
    billing_claim_id: string | null;
  }) => {
    if (!event.billing_claim_id) return "Ready for billing";
    const claimStatus = claimById.get(event.billing_claim_id);
    if (claimStatus === "accepted") return "Claim accepted";
    if (claimStatus === "rejected") return "Claim rejected";
    return "Claim submitted";
  };

  return (
    <>
      <article id="patient-billing" className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Patient billing information</h2>
        {!activeEventData ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            Click Billing from Scheduled Cases to open a patient here.
          </p>
        ) : (
          <>
            <p style={{ margin: "0 0 6px", fontWeight: 700 }}>
              {activeEventData.patient_display_name || activeEventData.title}
              {activeEventData.case_identifier
                ? ` • ${activeEventData.case_identifier}`
                : ""}
            </p>
            <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>
              Service date:{" "}
              {new Date(activeEventData.starts_at).toLocaleDateString()} | Visit
              type: {activeEventData.visit_type || "not set"}
            </p>
            <p style={{ margin: "0 0 4px", color: "var(--muted)" }}>
              Coverage: {getCoverageLabel(activeEventData)}
            </p>
            <p style={{ margin: 0 }}>
              Billing status: {getBillingStatusLabel(activeEventData)}
            </p>
          </>
        )}
      </article>

      <article
        id="billing-service-tracker"
        className="card"
        style={{ padding: 18 }}
      >
        <h2 style={{ marginTop: 0 }}>Billing service tracker</h2>
        <div className="dashboard-case-table" style={{ marginTop: 10 }}>
          <div className="dashboard-case-head billing-tracker-head">
            <span>Patient</span>
            <span>Service date</span>
            <span>Coverage</span>
            <span>Billing status</span>
            <span>Actions</span>
          </div>
          {rows.length === 0 ? (
            <div className="dashboard-case-empty">
              No schedule services found for billing.
            </div>
          ) : (
            rows.map((event) => {
              const isSelected = Boolean(
                activeEventData && event.id === activeEventData.id,
              );
              return (
                <article
                  key={event.id}
                  className="dashboard-case-row billing-tracker-row"
                  style={{
                    background: isSelected ? "var(--surface-soft)" : undefined,
                  }}
                >
                  <div className="dashboard-case-primary">
                    <strong>{event.patient_display_name || event.title}</strong>
                    <span>{event.case_identifier || "No case id"}</span>
                  </div>
                  <div className="dashboard-case-meta">
                    <strong>
                      {new Date(event.starts_at).toLocaleDateString()}
                    </strong>
                    <span>{event.status.replace(/_/g, " ")}</span>
                  </div>
                  <div className="dashboard-case-meta">
                    <strong>{getCoverageLabel(event)}</strong>
                  </div>
                  <div className="dashboard-case-meta">
                    <strong>{getBillingStatusLabel(event)}</strong>
                  </div>
                  <div className="dashboard-case-actions">
                    <Link
                      className="btn btn-secondary"
                      href={`/billing/service-tracker?eventId=${event.id}#patient-billing`}
                    >
                      Open patient
                    </Link>
                    <Link
                      className="btn btn-secondary"
                      href={`/billing/claims?eventId=${event.id}#submit-claim`}
                    >
                      Submit claim
                    </Link>
                    <Link
                      className="btn btn-secondary"
                      href={`/schedule-cases#case-${event.id}`}
                    >
                      Open case
                    </Link>
                  </div>
                </article>
              );
            })
          )}
        </div>
      </article>
    </>
  );
}
