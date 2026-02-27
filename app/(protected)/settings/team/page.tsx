import { revalidatePath } from 'next/cache'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

async function createInvite(formData: FormData) {
  'use server'

  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) return

  const email = String(formData.get('email') || '').trim()
  const role = String(formData.get('role') || 'provider')

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role')
    .eq('user_id', user.id)
    .limit(1)
    .maybeSingle()

  if (!membership || membership.role !== 'admin' || !email) return

  await supabase.rpc('create_tenant_invite', {
    target_tenant: membership.tenant_id,
    invite_email: email,
    invite_role: role,
  })

  revalidatePath('/settings/team')
}

export default async function TeamSettingsPage() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const { data: membership } = await supabase
    .from('tenant_memberships')
    .select('tenant_id,role,tenants(name)')
    .eq('user_id', user!.id)
    .limit(1)
    .maybeSingle()

  const [membersRes, invitesRes] = await Promise.all([
    membership
      ? supabase
          .from('tenant_memberships')
          .select('id,role,profiles!tenant_memberships_user_id_fkey(email,full_name)')
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
    profiles: { email: string; full_name: string } | { email: string; full_name: string }[] | null
  }>
  const invites = (invitesRes.data ?? []) as Array<{
    id: string
    email: string
    role: string
    invite_token: string
  }>
  const membershipTenant = Array.isArray(membership?.tenants) ? membership?.tenants[0] : membership?.tenants

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>Team & RBAC</h1>
        <p style={{ color: 'var(--muted)' }}>
          Workspace: {membershipTenant?.name ?? 'N/A'} | Your role: {membership?.role ?? 'N/A'}
        </p>

        {membership?.role === 'admin' ? (
          <form action={createInvite} style={{ display: 'grid', gap: 10, gridTemplateColumns: '2fr 1fr auto' }}>
            <input className="field" name="email" type="email" placeholder="teammate@org.com" required />
            <select className="field" name="role" defaultValue="provider">
              <option value="admin">admin</option>
              <option value="scheduler">scheduler</option>
              <option value="billing">billing</option>
              <option value="provider">provider</option>
            </select>
            <button className="btn btn-primary" type="submit">
              Create invite
            </button>
          </form>
        ) : (
          <p>Only admins can create invite tokens.</p>
        )}
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Members</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {members.map((member) => (
            <p key={member.id} style={{ margin: 0 }}>
              {(Array.isArray(member.profiles) ? member.profiles[0]?.full_name : member.profiles?.full_name) ??
                (Array.isArray(member.profiles) ? member.profiles[0]?.email : member.profiles?.email)}{' '}
              ({member.role})
            </p>
          ))}
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Active invites</h2>
        <div style={{ display: 'grid', gap: 8 }}>
          {invites.map((invite) => (
            <p key={invite.id} style={{ margin: 0 }}>
              {invite.email} ({invite.role}) token: <code>{invite.invite_token}</code>
            </p>
          ))}
        </div>
      </article>
    </section>
  )
}
