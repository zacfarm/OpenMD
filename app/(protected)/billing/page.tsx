import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { getRoleLabel, hasPermission } from '@/lib/rbac'

async function submitClaim(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !hasPermission(membership.role, 'manage_billing')) {
    redirect('/billing?error=You do not have permission to submit claims.')
  }

  const payerId = String(formData.get('payerId') || '')
  const patientName = String(formData.get('patientName') || '').trim()
  const memberId = String(formData.get('memberId') || '').trim()
  const serviceDate = String(formData.get('serviceDate') || '').trim()
  const cptCode = String(formData.get('cptCode') || '').trim()
  const diagnosisCode = String(formData.get('diagnosisCode') || '').trim()
  const billedAmount = Number(formData.get('billedAmount') || 0)
  const notes = String(formData.get('notes') || '').trim() || null

  if (!payerId || !patientName || !memberId || !serviceDate || !cptCode || !diagnosisCode || billedAmount <= 0) {
    redirect('/billing?error=Complete all claim fields before submitting.')
  }

  const { error } = await supabase.from('insurance_claims').insert({
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
  })

  if (error) {
    redirect(`/billing?error=${encodeURIComponent(error.message)}`)
  }

  revalidatePath('/billing')
  revalidatePath('/dashboard')
  redirect('/billing?success=Claim submitted successfully.')
}

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: { error?: string; success?: string }
}) {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name)')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'view_billing')) {
    redirect('/dashboard')
  }

  const [payersRes, claimsRes] = await Promise.all([
    supabase.from('insurance_payers').select('id,payer_name,payer_code,claim_endpoint').eq('is_active', true).order('payer_name'),
    membership
      ? supabase
          .from('insurance_claims')
          .select('id,patient_name,member_id,service_date,cpt_code,diagnosis_code,billed_amount,status,submitted_at,insurance_payers(payer_name,payer_code)')
          .eq('tenant_id', membership.tenant_id)
          .order('submitted_at', { ascending: false })
          .limit(30)
      : Promise.resolve({ data: [] as never[] }),
  ])

  const payers = payersRes.data ?? []
  const membershipTenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants
  const claims = (claimsRes.data ?? []) as Array<{
    id: string
    patient_name: string
    member_id: string
    service_date: string
    cpt_code: string
    diagnosis_code: string
    billed_amount: number
    status: string
    submitted_at: string
    insurance_payers:
      | { payer_name: string; payer_code: string }
      | { payer_name: string; payer_code: string }[]
      | null
  }>

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Billing Portal</h1>
        <p style={{ color: 'var(--muted)' }}>
          Workspace: {membershipTenant?.name ?? 'N/A'} |
          Your role: {getRoleLabel(membership?.role)}
        </p>

        {searchParams?.error && <p style={{ color: 'var(--warning)', margin: '8px 0' }}>{searchParams.error}</p>}
        {searchParams?.success && <p style={{ color: 'var(--ok)', margin: '8px 0' }}>{searchParams.success}</p>}

        {hasPermission(membership?.role, 'manage_billing') ? (
          <form action={submitClaim} style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
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
              <input className="field" name="patientName" required />
            </label>
            <label>
              Member ID
              <input className="field" name="memberId" required />
            </label>
            <label>
              Service date
              <input className="field" type="date" name="serviceDate" required />
            </label>
            <label>
              CPT code
              <input className="field" name="cptCode" placeholder="99213" required />
            </label>
            <label>
              Diagnosis code
              <input className="field" name="diagnosisCode" placeholder="J10.1" required />
            </label>
            <label>
              Billed amount
              <input className="field" type="number" min="0" step="0.01" name="billedAmount" required />
            </label>
            <label style={{ gridColumn: 'span 2' }}>
              Notes
              <input className="field" name="notes" placeholder="Optional claim notes" />
            </label>
            <div style={{ display: 'flex', alignItems: 'end' }}>
              <button className="btn btn-primary" type="submit">
                Submit claim
              </button>
            </div>
          </form>
        ) : (
          <p style={{ color: 'var(--muted)' }}>
            View-only access. Billing managers and billers can submit claims from this portal.
          </p>
        )}
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Recent claims</h2>
        <div style={{ display: 'grid', gap: 10 }}>
          {claims.length === 0 ? (
            <p style={{ margin: 0, color: 'var(--muted)' }}>No claims submitted yet.</p>
          ) : (
            claims.map((claim) => {
              const payer = Array.isArray(claim.insurance_payers) ? claim.insurance_payers[0] : claim.insurance_payers
              return (
                <div key={claim.id} style={{ borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                  <p style={{ margin: 0, fontWeight: 700 }}>
                    {claim.patient_name} • {payer?.payer_name ?? 'Unknown payer'}
                  </p>
                  <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                    Member ID: {claim.member_id} | CPT: {claim.cpt_code} | DX: {claim.diagnosis_code}
                  </p>
                  <p style={{ margin: '4px 0', color: 'var(--muted)' }}>
                    Service date: {new Date(claim.service_date).toLocaleDateString()} | Amount: ${claim.billed_amount.toFixed(2)} | Status: {claim.status}
                  </p>
                </div>
              )
            })
          )}
        </div>
      </article>
    </section>
  )
}
