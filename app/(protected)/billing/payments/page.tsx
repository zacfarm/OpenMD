import { revalidatePath } from "next/cache";
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

async function postPayment(formData: FormData) {
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
      "/billing/payments?error=You do not have permission to post payments.",
    );
  }

  const claimId = String(formData.get("claimId") || "");
  const amount = Number(formData.get("amount") || 0);
  const checkNumber = String(formData.get("checkNumber") || "").trim() || null;
  const paymentDate = String(formData.get("paymentDate") || "").trim();

  if (!claimId || amount <= 0) {
    redirect(
      "/billing/payments?error=Enter a valid claim and amount to post a payment.",
    );
  }

  const { error } = await supabase.from("insurance_claim_payments").insert({
    tenant_id: membership.tenant_id,
    claim_id: claimId,
    amount: Number(amount.toFixed(2)),
    payment_date: paymentDate || new Date().toISOString().slice(0, 10),
    check_number: checkNumber,
    posted_by: user.id,
  });

  if (error) {
    redirect(`/billing/payments?error=${encodeURIComponent(error.message)}`);
  }

  revalidatePath("/billing/payments");
  revalidatePath("/billing/claims");
  redirect("/billing/payments?success=Payment posted successfully.");
}

export default async function BillingPaymentsPage({
  searchParams,
}: {
  searchParams?: Promise<{ error?: string; success?: string }>;
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

  const [claimsRes, paymentsRes] = await Promise.all([
    supabase
      .from("insurance_claims")
      .select("id,patient_name,member_id,cpt_code")
      .eq("tenant_id", membership.tenant_id)
      .order("submitted_at", { ascending: false })
      .limit(100),
    supabase
      .from("insurance_claim_payments")
      .select("id,claim_id,amount,payment_date,posted_at")
      .eq("tenant_id", membership.tenant_id)
      .order("posted_at", { ascending: false })
      .limit(50),
  ]);

  const claims = (claimsRes.data ?? []) as Array<{
    id: string;
    patient_name: string;
    member_id: string;
    cpt_code: string;
  }>;

  const payments = (paymentsRes.data ?? []) as Array<{
    id: string;
    claim_id: string;
    amount: number;
    payment_date: string;
    posted_at: string;
  }>;

  const canManageBilling = hasPermission(membership.role, "manage_billing");

  return (
    <>
      {canManageBilling ? (
        <article id="post-payment" className="card" style={{ padding: 18 }}>
          <h2 style={{ marginTop: 0 }}>Post payment</h2>
          <form action={postPayment} style={{ display: "grid", gap: 10 }}>
            <label>
              Claim
              <select className="field" name="claimId" required defaultValue="">
                <option value="" disabled>
                  Select claim
                </option>
                {claims.map((claim) => (
                  <option key={claim.id} value={claim.id}>
                    {claim.patient_name} — {claim.member_id} ({claim.cpt_code})
                  </option>
                ))}
              </select>
            </label>
            <label>
              Amount
              <input
                className="field"
                name="amount"
                type="number"
                min="0"
                step="0.01"
                required
              />
            </label>
            <label>
              Payment date
              <input
                className="field"
                name="paymentDate"
                type="date"
                defaultValue={new Date().toISOString().slice(0, 10)}
              />
            </label>
            <label>
              Check number
              <input
                className="field"
                name="checkNumber"
                placeholder="Optional"
              />
            </label>
            <div style={{ display: "flex", alignItems: "end" }}>
              <button className="btn btn-primary" type="submit">
                Post payment
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
          <h2 style={{ marginTop: 0 }}>Post payment</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            View-only access. Billing managers and billers can post payments.
          </p>
        </article>
      )}

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Payment history</h2>
        <div style={{ display: "grid", gap: 10 }}>
          {payments.length === 0 ? (
            <p style={{ margin: 0, color: "var(--muted)" }}>
              No payments posted yet.
            </p>
          ) : (
            payments.map((payment) => (
              <div
                key={payment.id}
                style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>
                  Claim #{payment.claim_id.slice(0, 8)}
                </p>
                <p style={{ margin: "4px 0", color: "var(--muted)" }}>
                  Payment date:{" "}
                  {new Date(payment.payment_date).toLocaleDateString()} |
                  Amount: {formatMoney(Number(payment.amount ?? 0))}
                </p>
              </div>
            ))
          )}
        </div>
      </article>
    </>
  );
}
