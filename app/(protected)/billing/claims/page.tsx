import { revalidatePath } from "next/cache";
import Link from "next/link";
import { redirect } from "next/navigation";

import { hasPermission } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function formatMoney(value: number) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(value);
}

async function submitClaim(formData: FormData) {
  "use server";

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

  if (!membership || !hasPermission(membership.role, "manage_billing")) {
    redirect(
      "/billing/claims?error=You do not have permission to submit claims.",
    );
  }

  const payerId = String(formData.get("payerId") || "");
  const patientName = String(formData.get("patientName") || "").trim();
  const memberId = String(formData.get("memberId") || "").trim();
  const serviceDate = String(formData.get("serviceDate") || "").trim();
  const cptCode = String(formData.get("cptCode") || "").trim();
  const diagnosisCode = String(formData.get("diagnosisCode") || "").trim();
  const billedAmount = Number(formData.get("billedAmount") || 0);
  const notes = String(formData.get("notes") || "").trim() || null;

  if (
    !payerId ||
    !patientName ||
    !memberId ||
    !serviceDate ||
    !cptCode ||
    !diagnosisCode ||
    billedAmount <= 0
  ) {
    redirect(
      "/billing/claims?error=Complete all claim fields before submitting.",
    );
  }

  const { data: payerRecord } = await supabase
    .from("insurance_payers")
    .select("id")
    .eq("id", payerId)
    .eq("is_active", true)
    .maybeSingle();

  if (!payerRecord) {
    redirect(
      "/billing/claims?error=Selected payer is invalid or inactive. Choose a configured payer.",
    );
  }

  const { error } = await supabase.from("insurance_claims").insert({
    tenant_id: membership.tenant_id,
    payer_id: payerId,
    patient_name: patientName,
    member_id: memberId,
    service_date: serviceDate,
    cpt_code: cptCode,
    diagnosis_code: diagnosisCode,
    billed_amount: billedAmount,
    notes,
    submitted_by: user.id,
  });

  if (error) {
    redirect(`/billing/claims?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/billing/claims");
  revalidatePath("/billing/service-tracker");
  redirect("/billing/claims?success=Claim submitted successfully.");
}

export default async function BillingClaimsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string;
    success?: string;
    eventId?: string;
  }>;
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

  const [payersRes, claimsRes] = await Promise.all([
    supabase
      .from("insurance_payers")
      .select("id,payer_name,payer_code")
      .eq("is_active", true)
      .order("payer_name"),
    supabase
      .from("insurance_claims")
      .select(
        "id,patient_name,member_id,service_date,cpt_code,diagnosis_code,billed_amount,status,submitted_at,insurance_payers(payer_name,payer_code)",
      )
      .eq("tenant_id", membership.tenant_id)
      .order("submitted_at", { ascending: false })
      .limit(50),
  ]);

  const activeEvent = resolvedSearchParams?.eventId
    ? await supabase
        .from("schedule_events")
        .select("id,patient_display_name,starts_at")
        .eq("id", resolvedSearchParams.eventId)
        .eq("tenant_id", membership.tenant_id)
        .maybeSingle()
    : { data: null };

  const payers = payersRes.data ?? [];
  const claims = (claimsRes.data ?? []) as Array<{
    id: string;
    patient_name: string;
    member_id: string;
    service_date: string;
    cpt_code: string;
    diagnosis_code: string;
    billed_amount: number;
    status: string;
    submitted_at: string;
    insurance_payers:
      | { payer_name: string; payer_code: string }
      | { payer_name: string; payer_code: string }[]
      | null;
  }>;

  const canManageBilling = hasPermission(membership.role, "manage_billing");

  return (
    <>
      {canManageBilling ? (
        <article id="submit-claim" className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Submit claim</h2>
          <form
            action={submitClaim}
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
            }}
          >
            <label>
              Payer
              <select className="field" name="payerId" required defaultValue="">
                <option value="" disabled>
                  Select payer
                </option>
                {payers.map((payer) => (
                  <option key={payer.id} value={payer.id}>
                    {payer.payer_name} ({payer.payer_code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Patient name
              <input
                className="field"
                name="patientName"
                required
                defaultValue={activeEvent.data?.patient_display_name ?? ""}
              />
            </label>
            <label>
              Member ID
              <input className="field" name="memberId" required />
            </label>
            <label>
              Service date
              <input
                className="field"
                type="date"
                name="serviceDate"
                required
                defaultValue={activeEvent.data?.starts_at?.slice(0, 10) ?? ""}
              />
            </label>
            <label>
              CPT code
              <input
                className="field"
                name="cptCode"
                placeholder="99213"
                required
              />
            </label>
            <label>
              Diagnosis code
              <input
                className="field"
                name="diagnosisCode"
                placeholder="J10.1"
                required
              />
            </label>
            <label>
              Billed amount
              <input
                className="field"
                type="number"
                min="0"
                step="0.01"
                name="billedAmount"
                required
              />
            </label>
            <label>
              Notes
              <input
                className="field"
                name="notes"
                placeholder="Optional claim notes"
              />
            </label>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="btn btn-primary" type="submit">
                Submit claim
              </button>
            </div>
          </form>
          {resolvedSearchParams?.error && (
            <p style={{ color: "var(--warning)", margin: "10px 0 0" }}>
              {resolvedSearchParams.error}
            </p>
          )}
          {resolvedSearchParams?.success && (
            <p style={{ color: "var(--accent)", margin: "10px 0 0" }}>
              {resolvedSearchParams.success}
            </p>
          )}
        </article>
      ) : (
        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Submit claim</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            View-only access. Billing managers and billers can submit claims.
          </p>
        </article>
      )}

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Claim history</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {claims.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              No claims submitted yet.
            </p>
          ) : (
            claims.map((claim) => {
              const payer = Array.isArray(claim.insurance_payers)
                ? claim.insurance_payers[0]
                : claim.insurance_payers;
              return (
                <div
                  id={`claim-${claim.id}`}
                  key={claim.id}
                  style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
                >
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {claim.patient_name} •{" "}
                    {payer?.payer_name ?? "Unknown payer"}
                  </p>
                  <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                    Member ID: {claim.member_id} | CPT: {claim.cpt_code} | DX:{" "}
                    {claim.diagnosis_code}
                  </p>
                  <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                    Service date:{" "}
                    {new Date(claim.service_date).toLocaleDateString()} |
                    Amount: {formatMoney(Number(claim.billed_amount ?? 0))} |
                    Status: {claim.status}
                  </p>
                  <p style={{ margin: "4px 0 0" }}>
                    <Link href={`/schedule-cases`}>Open scheduled cases</Link>
                  </p>
                </div>
              );
            })
          )}
        </div>
      </article>
    </>
  );
}
