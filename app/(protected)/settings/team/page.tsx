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
  searchParams?: Promise<{ error?: string; success?: string }>
}) {
  const resolvedSearchParams = await searchParams
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
  const actionError = resolvedSearchParams?.error || null
  const actionSuccess = resolvedSearchParams?.success || null
  const now = new Date()
  const pendingInvites = invites.filter((invite) => invite.status !== 'accepted' && new Date(invite.expires_at) >= now)
  const acceptedInvites = invites.filter((invite) => invite.status === 'accepted')
  const expiredInvites = invites.filter((invite) => invite.status !== 'accepted' && new Date(invite.expires_at) < now)

  function getInitials(label: string) {
    const tokens = label
      .split(' ')
      .map((token) => token.trim())
      .filter(Boolean)
    if (tokens.length === 0) return '?'
    if (tokens.length === 1) return (tokens[0][0] ?? '?').toUpperCase()
    return `${tokens[0][0] ?? ''}${tokens[1][0] ?? ''}`.toUpperCase()
  }

  function formatDateTime(value: string) {
    return new Date(value).toLocaleString(undefined, {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })
  }

  function inviteTone(invite: { status: string; expires_at: string }) {
    if (invite.status === 'accepted') {
      return { label: 'Accepted', color: 'var(--ok)', bg: 'rgba(11, 124, 69, 0.12)' }
    }
    if (new Date(invite.expires_at) < now) {
      return { label: 'Expired', color: 'var(--warning)', bg: 'rgba(180, 74, 46, 0.12)' }
    }
    return { label: 'Pending', color: '#2f5d92', bg: 'rgba(45, 117, 190, 0.12)' }
  }

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article
        className="card"
        style={{
          padding: 20,
          background:
            'radial-gradient(circle at 88% 20%, rgba(12, 122, 90, 0.16), transparent 48%), linear-gradient(145deg, #f7fcf9 0%, #ffffff 62%, #edf6ff 100%)',
        }}
      >
        <p className="dashboard-eyebrow" style={{ marginBottom: 6 }}>Administration</p>
        <h1 style={{ margin: '0 0 4px', fontSize: 'clamp(1.4rem, 3vw, 1.9rem)' }}>Team Control Center</h1>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Manage roles, invitations, and workspace access for {membershipTenant?.name ?? 'your organization'}.
        </p>

        <div
          style={{
            marginTop: 16,
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(165px, 1fr))',
          }}
        >
          <div className="dashboard-mini-stat">
            <p className="metric-label">Your Role</p>
            <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{getRoleLabel(membership?.role ?? 'doctor')}</p>
          </div>
          <div className="dashboard-mini-stat">
            <p className="metric-label">Team Members</p>
            <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{members.length}</p>
          </div>
          <div className="dashboard-mini-stat">
            <p className="metric-label">Pending Invites</p>
            <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{pendingInvites.length}</p>
          </div>
          <div className="dashboard-mini-stat">
            <p className="metric-label">Accepted Invites</p>
            <p style={{ margin: '8px 0 0', fontWeight: 700 }}>{acceptedInvites.length}</p>
          </div>
        </div>
      </article>

      <div style={{ display: 'grid', gap: 14, gridTemplateColumns: '2fr 1fr' }}>
        <article className="card" style={{ padding: 18 }}>
          <h2 style={{ margin: '0 0 6px' }}>Invite a Team Member</h2>
          <p style={{ color: 'var(--muted)', margin: '0 0 14px', fontSize: 14 }}>
            Send role-based access invites for scheduling, credentialing, billing, and provider workflows.
          </p>

          {!process.env.NEXT_PUBLIC_APP_URL && (
            <p style={{ margin: '0 0 10px', color: 'var(--warning)' }}>
              NEXT_PUBLIC_APP_URL is not set. Invite links will point to localhost.
            </p>
          )}

          {actionError && (
            <p
              style={{
                margin: '0 0 10px',
                color: 'var(--warning)',
                background: 'rgba(180, 74, 46, 0.1)',
                border: '1px solid rgba(180, 74, 46, 0.28)',
                borderRadius: 10,
                padding: '8px 10px',
              }}
            >
              {actionError}
            </p>
          )}

          {actionSuccess && (
            <p
              style={{
                margin: '0 0 10px',
                color: 'var(--ok)',
                background: 'rgba(11, 124, 69, 0.1)',
                border: '1px solid rgba(11, 124, 69, 0.28)',
                borderRadius: 10,
                padding: '8px 10px',
              }}
            >
              {actionSuccess}
            </p>
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
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Invite Snapshot</h3>
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Pending</span>
              <strong>{pendingInvites.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Accepted</span>
              <strong>{acceptedInvites.length}</strong>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: 'var(--muted)', fontSize: 14 }}>Expired</span>
              <strong>{expiredInvites.length}</strong>
            </div>
          </div>
          <p style={{ margin: '10px 0 0', color: 'var(--muted)', fontSize: 12 }}>
            Use role labels to keep least-privilege access in place as your team grows.
          </p>
        </article>
      </div>

      <article className="card" style={{ padding: 18 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, flexWrap: 'wrap' }}>
          <h2 style={{ margin: 0 }}>Current Members</h2>
          <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>Role assignment and access visibility</p>
        </div>
        <div
          style={{
            marginTop: 12,
            display: 'grid',
            gap: 10,
            gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
          }}
        >
          {members.map((member) => {
            const profile = Array.isArray(member.profiles) ? member.profiles[0] : member.profiles
            const displayName = profile?.full_name || profile?.email || member.user_id
            const isCurrentUser = member.user_id === user!.id
            return (
              <article key={member.id} style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, background: '#fbfdfc' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      display: 'inline-flex',
                      width: 38,
                      height: 38,
                      borderRadius: '50%',
                      background: 'var(--accent)',
                      color: '#fff',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 800,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {getInitials(displayName)}
                  </span>
                  <div style={{ minWidth: 0 }}>
                    <p style={{ margin: 0, fontWeight: 700, wordBreak: 'break-word' }}>
                      {displayName}
                      {isCurrentUser && (
                        <span style={{ marginLeft: 6, fontSize: 12, color: 'var(--muted)', fontWeight: 500 }}>(you)</span>
                      )}
                    </p>
                    <p style={{ margin: '2px 0 0', color: 'var(--muted)', fontSize: 12 }}>{profile?.email || member.user_id}</p>
                  </div>
                </div>
                <div style={{ marginTop: 10 }}>
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 12,
                      padding: '4px 10px',
                      borderRadius: 999,
                      border: '1px solid #c8ddd4',
                      background: '#eff7f3',
                      color: '#234239',
                      fontWeight: 700,
                    }}
                  >
                    {getRoleLabel(member.role)}
                  </span>
                </div>
              </article>
            )
          })}
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 4 }}>Invitations</h2>
        <p style={{ color: 'var(--muted)', marginTop: 0, marginBottom: 12 }}>
          Track invite state, resend emails for pending invites, and share direct signup links when needed.
        </p>

        {invites.length === 0 ? (
          <p style={{ margin: 0, color: 'var(--muted)' }}>No invites yet.</p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {invites.map((invite) => {
              const inviteUrl = `${appBaseUrl}/signup?inviteToken=${encodeURIComponent(invite.invite_token)}`
              const tone = inviteTone(invite)
              const isAccepted = invite.status === 'accepted'
              const isExpired = new Date(invite.expires_at) < now

              return (
                <article
                  key={invite.id}
                  style={{
                    border: '1px solid var(--line)',
                    borderRadius: 12,
                    padding: 12,
                    background: 'linear-gradient(180deg, #ffffff 0%, #fbfdfc 100%)',
                  }}
                >
                  <div
                    style={{
                      display: 'grid',
                      gridTemplateColumns: '1fr auto',
                      gap: 10,
                      alignItems: 'center',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <p style={{ margin: 0, fontWeight: 700, wordBreak: 'break-word' }}>
                        {invite.email}
                      </p>
                      <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: 13 }}>
                        {getRoleLabel(invite.role)} • Expires {formatDateTime(invite.expires_at)}
                      </p>
                    </div>
                    <span
                      style={{
                        display: 'inline-block',
                        borderRadius: 999,
                        padding: '4px 10px',
                        fontSize: 12,
                        fontWeight: 700,
                        color: tone.color,
                        background: tone.bg,
                      }}
                    >
                      {tone.label}
                    </span>
                  </div>

                  <div
                    style={{
                      marginTop: 10,
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 10,
                      flexWrap: 'wrap',
                    }}
                  >
                    <p style={{ margin: 0, fontSize: 12, color: 'var(--muted)', wordBreak: 'break-all', flex: 1 }}>
                      {inviteUrl}
                    </p>
                    <SendInviteEmailButton
                      email={invite.email}
                      token={invite.invite_token}
                      role={getRoleLabel(invite.role)}
                      tenantName={membershipTenant?.name ?? 'OpenMD'}
                      disabled={isAccepted || isExpired}
                    />
                  </div>
                </article>
              )
            })}
          </div>
        )}
      </article>
    </section>
  )
}
