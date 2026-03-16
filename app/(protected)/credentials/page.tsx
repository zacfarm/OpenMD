import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { hasPermission, normalizeTenantRole } from '@/lib/rbac'
import ProviderCredentialsClient from '@/app/(protected)/credentials/ProviderCredentialsClient'
import AdminCredentialsReview from '@/app/(protected)/credentials/AdminCredentialsReview'

export default async function CredentialsPage() {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'view_credentials')) {
    redirect('/dashboard')
  }

  const role = normalizeTenantRole(membership?.role)
  const tenantId = membership!.tenant_id

  const isReviewer = role === 'admin' || role === 'facility_manager'

  // Fetch the provider profile for the current user (may be null for admin-only roles)
  const { data: providerProfile } = await supabase
    .from('provider_profiles')
    .select('id')
    .eq('user_id', user.id)
    .maybeSingle()

  // ── Provider view: own credentials ──────────────────────────────────────────
  if (!isReviewer && providerProfile) {
    const { data: credentials } = await supabase
      .from('provider_credentials')
      .select('id,credential_type,document_name,storage_path,status,notes,expires_on,created_at,credential_status_history(id,old_status,new_status,notes,created_at)')
      .eq('provider_id', providerProfile.id)
      .order('created_at', { ascending: false })

    return (
      <ProviderCredentialsClient
        initialCredentials={(credentials ?? []) as never}
        providerId={providerProfile.id}
        tenantId={tenantId}
      />
    )
  }

  // ── Reviewer view: all providers in tenant (facility-side admin roles only) ──
  if (isReviewer) {
    const { data: allCredentials } = await supabase
      .from('provider_credentials')
      .select('id,credential_type,document_name,storage_path,status,notes,expires_on,created_at,tenant_id,provider_profiles(id,display_name,specialty)')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })

    // If the reviewer is also a doctor they can upload their own too
    if (providerProfile) {
      const { data: ownCredentials } = await supabase
        .from('provider_credentials')
        .select('id,credential_type,document_name,storage_path,status,notes,expires_on,created_at,credential_status_history(id,old_status,new_status,notes,created_at)')
        .eq('provider_id', providerProfile.id)
        .order('created_at', { ascending: false })

      return (
        <section style={{ display: 'grid', gap: 14 }}>
          <AdminCredentialsReview
            credentials={(allCredentials ?? []) as never}
            tenantId={tenantId}
          />
          <ProviderCredentialsClient
            initialCredentials={(ownCredentials ?? []) as never}
            providerId={providerProfile.id}
            tenantId={tenantId}
          />
        </section>
      )
    }

    return (
      <AdminCredentialsReview
        credentials={(allCredentials ?? []) as never}
        tenantId={tenantId}
      />
    )
  }

  // Non-provider, non-review roles cannot access credentials workspace
  if (!providerProfile) {
    redirect('/dashboard')
  }

  redirect('/dashboard')
}
