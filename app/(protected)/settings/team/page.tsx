import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'
import { hasPermission, INVITABLE_TEAM_ROLES, getRoleLabel } from '@/lib/rbac'
import { SendInviteEmailButton } from '@/app/(protected)/settings/components/SendInviteEmailButton'

function toLegacyTenantRole(role: string) {
  if (role === 'doctor') return 'provider'
  if (role === 'credentialing') return 'scheduler'
  return role
}

async function createInvite(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const email = String(formData.get('email') || '').trim()
  const role = String(formData.get('role') || 'doctor')

  if (!INVITABLE_TEAM_ROLES.includes(role as (typeof INVITABLE_TEAM_ROLES)[number])) {
    redirect('/settings/team?error=Invalid invite role selected.')
  }

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || !hasPermission(membership.role, 'manage_team')) {
    redirect('/settings/team?error=You do not have permission to invite team members.')
  }

  if (!email) {
    redirect('/settings/team?error=Email is required.')
  }

  let { error } = await supabase.rpc('create_tenant_invite', {
    target_tenant: membership.tenant_id,
    invite_email: email,
    invite_role: role,
  })

  // Backward compatibility: if DB enum is still the legacy role set,
  // retry with legacy role names where possible.
  if (error?.message.includes('invalid input value for enum tenant_role')) {
    const legacyRole = toLegacyTenantRole(role)

    if (legacyRole !== role) {
      const retry = await supabase.rpc('create_tenant_invite', {
        target_tenant: membership.tenant_id,
        invite_email: email,
        invite_role: legacyRole,
      })

      error = retry.error
    }
  }

  if (error) {
    const migrationHint =
      error.message.includes('invalid input value for enum tenant_role')
        ? ' Run latest Supabase migrations, then retry.'
        : ''

    redirect(`/settings/team?error=${encodeURIComponent(`${error.message}${migrationHint}`)}`)
  }

  revalidatePath('/settings/team')
  redirect('/settings/team?success=Invite created successfully.')
}

export default async function TeamSettingsPage({
  searchParams,
}: {
  searchParams?: { error?: string; success?: string }
}) {
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name)')
    .eq('user_id', user!.id)
    .limit(1)
    .maybeSingle()

  if (!hasPermission(membership?.role, 'manage_team')) {
    redirect('/dashboard')
  }

  const [membersRes, invitesRes] = await Promise.all([
    membership
      ? supabase
          .from('tenant_memberships')
          .select('id,role,user_id,profiles!tenant_memberships_user_id_profile_fkey(email,full_name)')
          .eq('tenant_id', membership.tenant_id)
      : Promise.resolve({ data: [] as never[] }),
    membership
      ? supabase
          .from('tenant_invites')
          .select('id,email,role,invite_token,status,expires_at')
          .eq('tenant_id', membership.tenant_id)
          .order('created_at', { ascending: false })
      : Promise.resolve({ data: [] as never[] }),
  ])

  const members = (membersRes.data ?? []) as Array<{
    id: string
    role: string
    user_id: string
    profiles: { email: string; full_name: string } | { email: string; full_name: string }[] | null
  }>
  const invites = (invitesRes.data ?? []) as Array<{
    id: string
    email: string
    role: string
    invite_token: string
    status: string
    expires_at: string
  }>
  const membershipTenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants
  const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
  const actionError = searchParams?.error || null
  const actionSuccess = searchParams?.success || null

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Team & RBAC</h1>
        <p style={{ color: 'var(--muted)' }}>
          Workspace: {membershipTenant?.name ?? 'N/A'} | Your role: {membership?.role ?? 'N/A'}
        </p>

        {!process.env.NEXT_PUBLIC_APP_URL && (
          <p style={{ margin: '8px 0', color: 'var(--warning)' }}>
            NEXT_PUBLIC_APP_URL is not set. Invite links will point to localhost.
          </p>
        )}

        {actionError && (
          <p style={{ margin: '8px 0', color: 'var(--warning)' }}>{actionError}</p>
        )}

        {actionSuccess && (
          <p style={{ margin: '8px 0', color: 'var(--ok)' }}>{actionSuccess}</p>
        )}

        <form action={createInvite} style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr auto' }}>
          <input className="field" name="email" type="email" placeholder="teammate@org.com" required />
          <select className="field" name="role" defaultValue="doctor">
            {INVITABLE_TEAM_ROLES.map((r) => (
              <option key={r} value={r}>
                {getRoleLabel(r)}
              </option>
            ))}
          </select>
          <button className="btn btn-primary" type="submit">
            Create invite
          </button>
        </form>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Members</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {members.map((member) => {
            const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
            const displayName = profile?.full_name || profile?.email || member.user_id
            const isCurrentUser = member.user_id === user!.id
            return (
              <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span
                  style={{
                    display: 'inline-block',
                    width: 32,
                    height: 32,
                    borderRadius: '50%',
                    background: 'var(--accent)',
                    color: '#fff',
                    textAlign: 'center',
                    lineHeight: '32px',
                    fontWeight: 700,
                    fontSize: 14,
                    flexShrink: 0,
                  }}
                >
                  {(displayName?.[0] ?? '?').toUpperCase()}
                </span>
                <div>
                  <p style={{ margin: 0 }}>
                    {displayName}
                    {isCurrentUser && (
                      <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--muted)' }}>(you)</span>
                    )}
                  </p>
                  <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)' }}>{getRoleLabel(member.role)}</p>
                </div>
              </div>
            )
          })}
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Active invites</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0 }}>
          Invitations waiting to be accepted. Click "Send email" to notify the recipient.
        </p>
        <div style={{ display: 'grid', gap: 8 }}>
          {invites.map((invite) => {
            const inviteUrl = `${appBaseUrl}/signup?inviteToken=${encodeURIComponent(invite.invite_token)}`
            const isAccepted = invite.status === 'accepted'
            const isExpired = new Date(invite.expires_at) < new Date()

            return (
              <div key={invite.id} style={{ margin: 0, borderTop: '1px solid var(--line)', paddingTop: 10 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10 }}>
                  <div style={{ flex: 1 }}>
                    <p style={{ margin: 0 }}>
                      {invite.email} ({getRoleLabel(invite.role)})
                      {isAccepted && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--accent)', fontWeight: 700 }}>
                          ✓ Accepted
                        </span>
                      )}
                      {isExpired && (
                        <span style={{ marginLeft: 8, fontSize: 12, color: 'var(--warning)', fontWeight: 700 }}>
                          ✗ Expired
                        </span>
                      )}
                    </p>
                    <p style={{ margin: '4px 0', fontSize: 12, color: 'var(--muted)' }}>
                      Status: {invite.status}
                    </p>
                  </div>
                  <SendInviteEmailButton
                    email={invite.email}
                    token={invite.invite_token}
                    role={getRoleLabel(invite.role)}
                    tenantName={membershipTenant?.name ?? 'OpenMD'}
                    disabled={isAccepted || isExpired}
                  />
                </div>
                <p style={{ margin: '4px 0 0', fontSize: 12, wordBreak: 'break-all', color: 'var(--muted)' }}>
                  {inviteUrl}
                </p>
              </div>
            )
          })}
        </div>
      </article>
    </section>
  )
}
