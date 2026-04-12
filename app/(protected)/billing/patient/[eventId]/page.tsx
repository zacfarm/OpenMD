import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type InsuranceCompanyRef = {
  name: string;
  payer_code: string | null;
  address_line_1: string | null;
  city: string | null;
  state: string | null;
  zip: string | null;
  network_status: "in_network" | "out_of_network" | null;
};

type ProcedureTypeRef = {
  name: string;
};

type ProviderRef = {
  display_name: string;
  specialty: string | null;
};

function takeFirst<T>(value: T | T[] | null | undefined): T | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

function formatDateTime(value: string) {
  return new Date(value).toLocaleString();
}

function formatAddress(parts: Array<string | null | undefined>) {
  const filtered = parts
    .map((part) => (part ?? "").trim())
    .filter((part) => part.length > 0);
  return filtered.length > 0 ? filtered.join(", ") : "Not provided";
}

function formatClaimStatus(status: string | null | undefined) {
  if (!status) return "Ready for billing";
  if (status === "accepted") return "Claim accepted";
  if (status === "rejected") return "Claim rejected";
  return "Claim submitted";
}

export default async function BillingPatientDetailsPage({
  params,
}: {
  params: Promise<{ eventId: string }>;
}) {
  const resolvedParams = await params;
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

  const { data: eventData } = await supabase
    .from("schedule_events")
    .select(
      "id,title,case_identifier,patient_display_name,patient_first_name,patient_last_name,patient_address_line_1,patient_city,patient_state,patient_zip,patient_sex,starts_at,ends_at,status,visit_type,practice_name,facility_name,notes,billing_claim_id,provider_profiles(display_name,specialty),tenant_schedule_insurance_companies(name,payer_code,address_line_1,city,state,zip,network_status),tenant_schedule_procedure_types(name)",
    )
    .eq("id", resolvedParams.eventId)
    .eq("tenant_id", membership.tenant_id)
    .maybeSingle();

  if (!eventData) {
    redirect("/billing/service-tracker");
  }

  const insurance = takeFirst(
    eventData.tenant_schedule_insurance_companies,
  ) as InsuranceCompanyRef | null;
  const procedureType = takeFirst(
    eventData.tenant_schedule_procedure_types,
  ) as ProcedureTypeRef | null;
  const provider = takeFirst(eventData.provider_profiles) as ProviderRef | null;

  const patientDisplayName =
    eventData.patient_display_name ||
    [eventData.patient_first_name, eventData.patient_last_name]
      .filter(Boolean)
      .join(" ") ||
    eventData.title;

  let visitHistoryQuery = supabase
    .from("schedule_events")
    .select(
      "id,case_identifier,title,starts_at,ends_at,status,visit_type,billing_claim_id,facility_name,practice_name,tenant_schedule_insurance_companies(name,payer_code),tenant_schedule_procedure_types(name)",
    )
    .eq("tenant_id", membership.tenant_id)
    .order("starts_at", { ascending: false })
    .limit(25);

  if (eventData.patient_display_name) {
    visitHistoryQuery = visitHistoryQuery.eq(
      "patient_display_name",
      eventData.patient_display_name,
    );
  } else if (eventData.patient_first_name && eventData.patient_last_name) {
    visitHistoryQuery = visitHistoryQuery
      .eq("patient_first_name", eventData.patient_first_name)
      .eq("patient_last_name", eventData.patient_last_name);
  }

  const { data: visitHistoryData } = await visitHistoryQuery;

  const visitHistory = (visitHistoryData ?? []) as Array<{
    id: string;
    case_identifier: string | null;
    title: string;
    starts_at: string;
    ends_at: string;
    status: string;
    visit_type: "inpatient" | "outpatient" | null;
    billing_claim_id: string | null;
    facility_name: string | null;
    practice_name: string | null;
    tenant_schedule_insurance_companies:
      | { name: string; payer_code: string | null }
      | { name: string; payer_code: string | null }[]
      | null;
    tenant_schedule_procedure_types:
      | { name: string }
      | { name: string }[]
      | null;
  }>;

  const claimIds = Array.from(
    new Set(
      visitHistory
        .map((visit) => visit.billing_claim_id)
        .filter((claimId): claimId is string => Boolean(claimId)),
    ),
  );

  const claimById = new Map<string, { status: string }>();
  if (claimIds.length > 0) {
    const { data: claimRows } = await supabase
      .from("insurance_claims")
      .select("id,status")
      .in("id", claimIds);

    for (const claim of claimRows ?? []) {
      claimById.set(claim.id, { status: claim.status });
    }
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h2 style={{ margin: 0 }}>Patient billing information</h2>
          <Link className="btn btn-secondary" href="/billing/service-tracker">
            Back to tracker
          </Link>
        </div>
        <p style={{ margin: "10px 0 0", color: "var(--muted)" }}>
          {patientDisplayName}
          {eventData.case_identifier ? ` • ${eventData.case_identifier}` : ""}
        </p>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Patient profile</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0 }}>
            <strong>Full name:</strong> {patientDisplayName}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Address:</strong>{" "}
            {formatAddress([
              eventData.patient_address_line_1,
              eventData.patient_city,
              eventData.patient_state,
              eventData.patient_zip,
            ])}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Sex:</strong> {eventData.patient_sex ?? "Not provided"}
          </p>
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Insurance information</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0 }}>
            <strong>Company:</strong>{" "}
            {insurance
              ? insurance.payer_code
                ? `${insurance.name} (${insurance.payer_code})`
                : insurance.name
              : "No insurance assigned"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Network:</strong>{" "}
            {insurance?.network_status?.replace(/_/g, " ") ?? "Not provided"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Insurance address:</strong>{" "}
            {insurance
              ? formatAddress([
                  insurance.address_line_1,
                  insurance.city,
                  insurance.state,
                  insurance.zip,
                ])
              : "Not provided"}
          </p>
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Visit details</h3>
        <div style={{ display: "grid", gap: 6 }}>
          <p style={{ margin: 0 }}>
            <strong>Service window:</strong>{" "}
            {formatDateTime(eventData.starts_at)} -{" "}
            {formatDateTime(eventData.ends_at)}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Visit type:</strong> {eventData.visit_type ?? "Not set"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Procedure type:</strong> {procedureType?.name ?? "Not set"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Provider:</strong>{" "}
            {provider
              ? provider.specialty
                ? `${provider.display_name} (${provider.specialty})`
                : provider.display_name
              : "Not assigned"}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Practice / Facility:</strong>{" "}
            {formatAddress([eventData.practice_name, eventData.facility_name])}
          </p>
          <p style={{ margin: 0 }}>
            <strong>Notes:</strong> {eventData.notes || "No notes"}
          </p>
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h3 style={{ marginTop: 0, marginBottom: 8 }}>Visit history</h3>
        {visitHistory.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No visit history found for this patient.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {visitHistory.map((visit) => {
              const visitInsurance = takeFirst(
                visit.tenant_schedule_insurance_companies,
              ) as { name: string; payer_code: string | null } | null;
              const visitProcedure = takeFirst(
                visit.tenant_schedule_procedure_types,
              ) as { name: string } | null;
              const claimStatus = visit.billing_claim_id
                ? claimById.get(visit.billing_claim_id)?.status
                : null;

              return (
                <div
                  key={visit.id}
                  style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                >
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {new Date(visit.starts_at).toLocaleDateString()} •{" "}
                    {visit.case_identifier || visit.title}
                  </p>
                  <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                    Visit type: {visit.visit_type ?? "not set"} | Procedure:{" "}
                    {visitProcedure?.name ?? "not set"}
                  </p>
                  <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                    Insurance:{" "}
                    {visitInsurance
                      ? visitInsurance.payer_code
                        ? `${visitInsurance.name} (${visitInsurance.payer_code})`
                        : visitInsurance.name
                      : "not set"}
                  </p>
                  <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                    Service status: {visit.status.replace(/_/g, " ")} | Billing:{" "}
                    {formatClaimStatus(claimStatus)}
                  </p>
                  <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                    <Link
                      className="btn btn-secondary"
                      href={`/billing/service-tracker?eventId=${visit.id}#patient-billing`}
                    >
                      Open in tracker
                    </Link>
                    <Link
                      className="btn btn-secondary"
                      href={`/billing/claims?eventId=${visit.id}#submit-claim`}
                    >
                      Open claim form
                    </Link>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </article>
    </section>
  );
}
