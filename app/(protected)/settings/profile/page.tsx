import { revalidatePath } from 'next/cache'
import { redirect } from 'next/navigation'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

type SettingsPayload = {
  phone?: string | null
  timezone?: string
  preferred_contact?: 'email' | 'phone' | 'in_app'
  quiet_hours_start?: string | null
  quiet_hours_end?: string | null
  digest_frequency?: 'realtime' | 'daily' | 'weekly' | 'off'
  public_profile_visible?: boolean
  show_location?: boolean
  internal_only_contact?: boolean
  provider_npi?: string | null
  provider_license_state?: string | null
  provider_license_number?: string | null
  provider_board_certifications?: string[]
  billing_payer_focus?: string[]
  billing_certifications?: string[]
  credentialing_domains?: string[]
  credentialing_regions?: string[]
  linkedin_url?: string | null
  publications_url?: string | null
  cv_url?: string | null
  credential_docs_url?: string | null
  avatar_path?: string | null
}

async function logSecurityAction(
  userId: string,
  action: string,
  metadata: Record<string, string | number | boolean | null> = {},
) {
  const supabase = await createSupabaseServerClient()
  await supabase.from('user_security_audit_logs').insert({
    user_id: userId,
    action,
    metadata,
  })
}

async function upsertUserSettings(userId: string, payload: SettingsPayload) {
  const supabase = await createSupabaseServerClient()
  return supabase.from('user_profile_settings').upsert(
    {
      user_id: userId,
      ...payload,
    },
    { onConflict: 'user_id' },
  )
}

function parseCsv(value: string): string[] {
  return value
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean)
}

async function updateProfile(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const fullName = String(formData.get('full_name') || '').trim()
  const providerProfileId = String(formData.get('provider_profile_id') || '').trim()

  if (!fullName) {
    redirect('/settings/profile?error=Full name is required.')
  }

  const { error: profileError } = await supabase
    .from('profiles')
    .update({ full_name: fullName })
    .eq('id', user.id)

  if (profileError) {
    redirect(`/settings/profile?error=${encodeURIComponent(profileError.message)}`)
  }

  if (providerProfileId) {
    const displayName = String(formData.get('display_name') || '').trim()
    const specialty = String(formData.get('specialty') || '').trim()
    const homeCity = String(formData.get('home_city') || '').trim()
    const homeState = String(formData.get('home_state') || '').trim()
    const isPublic = formData.get('is_public') === 'on'

    const { error: providerError } = await supabase
      .from('provider_profiles')
      .update({
        display_name: displayName || fullName,
        specialty: specialty || null,
        home_city: homeCity || null,
        home_state: homeState || null,
        is_public: isPublic,
      })
      .eq('id', providerProfileId)
      .eq('user_id', user.id)

    if (providerError) {
      redirect(`/settings/profile?error=${encodeURIComponent(providerError.message)}`)
    }
  }

  await logSecurityAction(user.id, 'profile_updated')

  revalidatePath('/settings/profile')
  revalidatePath('/dashboard')
  revalidatePath('/providers')
  redirect('/settings/profile?success=Profile updated.')
}

async function updatePassword(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const password = String(formData.get('password') || '')
  const confirmPassword = String(formData.get('confirm_password') || '')

  if (!password || !confirmPassword) {
    redirect('/settings/profile?passwordError=Both password fields are required.')
  }

  if (password.length < 8) {
    redirect('/settings/profile?passwordError=Password must be at least 8 characters.')
  }

  if (password !== confirmPassword) {
    redirect('/settings/profile?passwordError=New password and confirmation do not match.')
  }

  const { error } = await supabase.auth.updateUser({ password })

  if (error) {
    redirect(`/settings/profile?passwordError=${encodeURIComponent(error.message)}`)
  }

  await logSecurityAction(user.id, 'password_updated')

  revalidatePath('/settings/profile')
  redirect('/settings/profile?passwordSuccess=Password updated successfully.')
}

async function updateEmail(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const email = String(formData.get('email') || '').trim().toLowerCase()
  if (!email || !email.includes('@')) {
    redirect('/settings/profile?emailError=Please enter a valid email address.')
  }

  const { error } = await supabase.auth.updateUser({ email })
  if (error) {
    redirect(`/settings/profile?emailError=${encodeURIComponent(error.message)}`)
  }

  await logSecurityAction(user.id, 'email_change_requested', { next_email: email })

  revalidatePath('/settings/profile')
  redirect('/settings/profile?emailSuccess=Email update requested. Check your inbox to confirm.')
}

async function revokeOtherSessions() {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const { error } = await supabase.auth.signOut({ scope: 'others' })
  if (error) {
    redirect(`/settings/profile?sessionError=${encodeURIComponent(error.message)}`)
  }

  await logSecurityAction(user.id, 'sessions_revoked_others')

  revalidatePath('/settings/profile')
  redirect('/settings/profile?sessionSuccess=Other active sessions were signed out.')
}

async function uploadAvatar(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const file = formData.get('avatar')
  if (!(file instanceof File) || file.size === 0) {
    redirect('/settings/profile?avatarError=Please choose an image file to upload.')
  }

  if (file.size > 2 * 1024 * 1024) {
    redirect('/settings/profile?avatarError=Avatar image must be 2MB or smaller.')
  }

  const ext = (file.name.split('.').pop() || '').toLowerCase()
  const allowed = ['png', 'jpg', 'jpeg', 'webp']
  if (!allowed.includes(ext)) {
    redirect('/settings/profile?avatarError=Allowed image types: png, jpg, jpeg, webp.')
  }

  const avatarPath = `${user.id}/avatar.${ext}`
  const { error: uploadError } = await supabase.storage
    .from('profile-avatars')
    .upload(avatarPath, file, { upsert: true, contentType: file.type || 'application/octet-stream' })

  if (uploadError) {
    redirect(`/settings/profile?avatarError=${encodeURIComponent(uploadError.message)}`)
  }

  const { error: saveError } = await upsertUserSettings(user.id, { avatar_path: avatarPath })
  if (saveError) {
    redirect(`/settings/profile?avatarError=${encodeURIComponent(saveError.message)}`)
  }

  await logSecurityAction(user.id, 'avatar_updated')

  revalidatePath('/settings/profile')
  redirect('/settings/profile?avatarSuccess=Profile photo updated.')
}

async function updatePreferences(formData: FormData) {
  'use server'

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const preferredContact = String(formData.get('preferred_contact') || 'email')
  const digestFrequency = String(formData.get('digest_frequency') || 'realtime')

  const safePreferredContact: 'email' | 'phone' | 'in_app' =
    preferredContact === 'phone' || preferredContact === 'in_app' ? preferredContact : 'email'

  const safeDigestFrequency: 'realtime' | 'daily' | 'weekly' | 'off' =
    digestFrequency === 'daily' || digestFrequency === 'weekly' || digestFrequency === 'off'
      ? digestFrequency
      : 'realtime'

  const { error } = await upsertUserSettings(user.id, {
    phone: String(formData.get('phone') || '').trim() || null,
    timezone: String(formData.get('timezone') || '').trim() || 'UTC',
    preferred_contact: safePreferredContact,
    quiet_hours_start: String(formData.get('quiet_hours_start') || '').trim() || null,
    quiet_hours_end: String(formData.get('quiet_hours_end') || '').trim() || null,

    digest_frequency: safeDigestFrequency,

    public_profile_visible: formData.get('public_profile_visible') === 'on',
    show_location: formData.get('show_location') === 'on',
    internal_only_contact: formData.get('internal_only_contact') === 'on',

    provider_npi: String(formData.get('provider_npi') || '').trim() || null,
    provider_license_state: String(formData.get('provider_license_state') || '').trim() || null,
    provider_license_number: String(formData.get('provider_license_number') || '').trim() || null,
    provider_board_certifications: parseCsv(String(formData.get('provider_board_certifications') || '')),

    billing_payer_focus: parseCsv(String(formData.get('billing_payer_focus') || '')),
    billing_certifications: parseCsv(String(formData.get('billing_certifications') || '')),

    credentialing_domains: parseCsv(String(formData.get('credentialing_domains') || '')),
    credentialing_regions: parseCsv(String(formData.get('credentialing_regions') || '')),

    linkedin_url: String(formData.get('linkedin_url') || '').trim() || null,
    publications_url: String(formData.get('publications_url') || '').trim() || null,
    cv_url: String(formData.get('cv_url') || '').trim() || null,
    credential_docs_url: String(formData.get('credential_docs_url') || '').trim() || null,
  })

  if (error) {
    redirect(`/settings/profile?prefsError=${encodeURIComponent(error.message)}`)
  }

  await logSecurityAction(user.id, 'profile_preferences_updated')

  revalidatePath('/settings/profile')
  redirect('/settings/profile?prefsSuccess=Profile preferences saved.')
}

export default async function ProfileSettingsPage({
  searchParams,
}: {
  searchParams?: Promise<{
    error?: string
    success?: string
    emailError?: string
    emailSuccess?: string
    passwordError?: string
    passwordSuccess?: string
    sessionError?: string
    sessionSuccess?: string
    avatarError?: string
    avatarSuccess?: string
    prefsError?: string
    prefsSuccess?: string
  }>
}) {
  const resolvedSearchParams = await searchParams
  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    redirect('/login')
  }

  const [{ data: profile }, { data: providerProfile }, { data: memberships }, { data: settings }, { data: auditRows }] = await Promise.all([
    supabase
      .from('profiles')
      .select('id,email,full_name')
      .eq('id', user.id)
      .maybeSingle(),
    supabase
      .from('provider_profiles')
      .select('id,display_name,specialty,home_city,home_state,is_public')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('tenant_memberships')
      .select('role')
      .eq('user_id', user.id),
    supabase
      .from('user_profile_settings')
      .select('*')
      .eq('user_id', user.id)
      .maybeSingle(),
    supabase
      .from('user_security_audit_logs')
      .select('id,action,metadata,created_at')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(12),
  ])

  const actionError = resolvedSearchParams?.error || null
  const actionSuccess = resolvedSearchParams?.success || null
  const emailError = resolvedSearchParams?.emailError || null
  const emailSuccess = resolvedSearchParams?.emailSuccess || null
  const passwordError = resolvedSearchParams?.passwordError || null
  const passwordSuccess = resolvedSearchParams?.passwordSuccess || null
  const sessionError = resolvedSearchParams?.sessionError || null
  const sessionSuccess = resolvedSearchParams?.sessionSuccess || null
  const avatarError = resolvedSearchParams?.avatarError || null
  const avatarSuccess = resolvedSearchParams?.avatarSuccess || null
  const prefsError = resolvedSearchParams?.prefsError || null
  const prefsSuccess = resolvedSearchParams?.prefsSuccess || null

  const roles = Array.from(new Set((memberships ?? []).map((m) => m.role).filter(Boolean)))
  const isDoctor = roles.includes('doctor') || roles.includes('provider')
  const isBilling = roles.includes('billing')
  const isCredentialing = roles.includes('credentialing') || roles.includes('scheduler')

  let avatarUrl: string | null = null
  if (settings?.avatar_path) {
    const { data: signed } = await supabase.storage
      .from('profile-avatars')
      .createSignedUrl(settings.avatar_path, 3600)
    avatarUrl = signed?.signedUrl ?? null
  }

  function formatArray(values: string[] | null | undefined): string {
    return (values ?? []).join(', ')
  }

  const onboardingItems: Array<{ label: string; done: boolean }> = [
    { label: 'Full name added', done: Boolean(profile?.full_name?.trim()) },
    { label: 'Phone and timezone set', done: Boolean(settings?.phone && settings?.timezone) },
    { label: 'Preferred contact selected', done: Boolean(settings?.preferred_contact) },
  ]

  if (isDoctor) {
    onboardingItems.push(
      { label: 'Provider display name and specialty', done: Boolean(providerProfile?.display_name && providerProfile?.specialty) },
      { label: 'NPI and license details', done: Boolean(settings?.provider_npi && settings?.provider_license_number) },
      { label: 'Professional profile link', done: Boolean(settings?.linkedin_url || settings?.cv_url || settings?.credential_docs_url) },
    )
  }
  if (isBilling) {
    onboardingItems.push(
      { label: 'Billing payer focus entered', done: Boolean(settings?.billing_payer_focus && settings.billing_payer_focus.length > 0) },
      { label: 'Billing certification entered', done: Boolean(settings?.billing_certifications && settings.billing_certifications.length > 0) },
    )
  }
  if (isCredentialing) {
    onboardingItems.push(
      { label: 'Credentialing domains entered', done: Boolean(settings?.credentialing_domains && settings.credentialing_domains.length > 0) },
      { label: 'Credentialing regions entered', done: Boolean(settings?.credentialing_regions && settings.credentialing_regions.length > 0) },
    )
  }

  const completedOnboarding = onboardingItems.filter((item) => item.done).length
  const onboardingPercent = onboardingItems.length > 0
    ? Math.round((completedOnboarding / onboardingItems.length) * 100)
    : 0

  return (
    <section style={{ display: 'grid', gap: 14 }}>
      <article
        className="card"
        style={{
          padding: 20,
          background:
            'radial-gradient(circle at 84% 18%, rgba(13, 117, 161, 0.14), transparent 42%), linear-gradient(150deg, #f7fcff 0%, #ffffff 56%, #eef9f3 100%)',
        }}
      >
        <p className="dashboard-eyebrow" style={{ marginBottom: 6 }}>Profile</p>
        <h1 style={{ margin: '0 0 4px', fontSize: 'clamp(1.35rem, 3vw, 1.85rem)' }}>Account Settings</h1>
        <p style={{ margin: 0, color: 'var(--muted)' }}>
          Manage your OpenMD identity details across all roles and workspaces.
        </p>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Edit Profile</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Your name appears in team settings, notifications, and activity summaries.
        </p>

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

        <form action={updateProfile} style={{ display: 'grid', gap: 12 }}>
          <input type="hidden" name="provider_profile_id" value={providerProfile?.id ?? ''} />

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Email</span>
            <input className="field" value={profile?.email ?? user.email ?? ''} readOnly disabled />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Full name</span>
            <input
              className="field"
              name="full_name"
              defaultValue={profile?.full_name ?? ''}
              maxLength={120}
              required
            />
          </label>

          {providerProfile && (
            <div
              style={{
                border: '1px solid var(--line)',
                borderRadius: 12,
                padding: 12,
                background: 'linear-gradient(180deg, #ffffff 0%, #fbfdfc 100%)',
                display: 'grid',
                gap: 10,
              }}
            >
              <h3 style={{ margin: 0 }}>Provider Profile</h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                Keep your provider details accurate for scheduling, credentials, and directory visibility.
              </p>

              <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Display name</span>
                  <input
                    className="field"
                    name="display_name"
                    defaultValue={providerProfile.display_name ?? ''}
                    maxLength={120}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Specialty</span>
                  <input
                    className="field"
                    name="specialty"
                    defaultValue={providerProfile.specialty ?? ''}
                    maxLength={120}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Home city</span>
                  <input
                    className="field"
                    name="home_city"
                    defaultValue={providerProfile.home_city ?? ''}
                    maxLength={120}
                  />
                </label>

                <label style={{ display: 'grid', gap: 6 }}>
                  <span style={{ fontSize: 13, color: 'var(--muted)' }}>Home state</span>
                  <input
                    className="field"
                    name="home_state"
                    defaultValue={providerProfile.home_state ?? ''}
                    maxLength={120}
                  />
                </label>
              </div>

              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
                <input
                  name="is_public"
                  type="checkbox"
                  defaultChecked={providerProfile.is_public}
                />
                Show my provider profile in public directory listings
              </label>
            </div>
          )}

          <div>
            <button className="btn btn-primary" type="submit">
              Save changes
            </button>
          </div>
        </form>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Profile Photo</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Upload a profile avatar used across team and notification screens.
        </p>

        {(avatarError || avatarSuccess) && (
          <p
            style={{
              margin: '0 0 10px',
              color: avatarError ? 'var(--warning)' : 'var(--ok)',
              background: avatarError ? 'rgba(180, 74, 46, 0.1)' : 'rgba(11, 124, 69, 0.1)',
              border: avatarError ? '1px solid rgba(180, 74, 46, 0.28)' : '1px solid rgba(11, 124, 69, 0.28)',
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            {avatarError || avatarSuccess}
          </p>
        )}

        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'center' }}>
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: '50%',
              border: '1px solid var(--line)',
              overflow: 'hidden',
              display: 'grid',
              placeItems: 'center',
              background: '#eef4f2',
              fontWeight: 800,
              color: '#285042',
            }}
          >
            {avatarUrl ? (
              <img src={avatarUrl} alt="Profile avatar" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
            ) : (
              (profile?.full_name || user.email || 'U').slice(0, 1).toUpperCase()
            )}
          </div>

          <form action={uploadAvatar} style={{ display: 'grid', gap: 10 }}>
            <input className="field" type="file" name="avatar" accept="image/png,image/jpeg,image/webp" required />
            <div>
              <button className="btn btn-primary" type="submit">Upload avatar</button>
            </div>
          </form>
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Contact, Routing, and Privacy</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Configure communication details and visibility controls.
        </p>

        {(prefsError || prefsSuccess) && (
          <p
            style={{
              margin: '0 0 10px',
              color: prefsError ? 'var(--warning)' : 'var(--ok)',
              background: prefsError ? 'rgba(180, 74, 46, 0.1)' : 'rgba(11, 124, 69, 0.1)',
              border: prefsError ? '1px solid rgba(180, 74, 46, 0.28)' : '1px solid rgba(11, 124, 69, 0.28)',
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            {prefsError || prefsSuccess}
          </p>
        )}

        <form action={updatePreferences} style={{ display: 'grid', gap: 12 }}>
          <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Phone</span>
              <input className="field" name="phone" defaultValue={settings?.phone ?? ''} maxLength={30} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Timezone</span>
              <input className="field" name="timezone" defaultValue={settings?.timezone ?? 'UTC'} maxLength={80} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Preferred contact</span>
              <select className="field" name="preferred_contact" defaultValue={settings?.preferred_contact ?? 'email'}>
                <option value="email">Email</option>
                <option value="phone">Phone</option>
                <option value="in_app">In-app</option>
              </select>
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Quiet hours start</span>
              <input className="field" type="time" name="quiet_hours_start" defaultValue={settings?.quiet_hours_start ?? ''} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Quiet hours end</span>
              <input className="field" type="time" name="quiet_hours_end" defaultValue={settings?.quiet_hours_end ?? ''} />
            </label>
            <label style={{ display: 'grid', gap: 6 }}>
              <span style={{ fontSize: 13, color: 'var(--muted)' }}>Digest frequency</span>
              <select className="field" name="digest_frequency" defaultValue={settings?.digest_frequency ?? 'realtime'}>
                <option value="realtime">Real-time</option>
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="off">Off</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gap: 8 }}>
            <strong style={{ fontSize: 14 }}>Privacy controls</strong>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input name="public_profile_visible" type="checkbox" defaultChecked={settings?.public_profile_visible ?? true} /> Public profile visible
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input name="show_location" type="checkbox" defaultChecked={settings?.show_location ?? true} /> Show city/state when available
            </label>
            <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <input name="internal_only_contact" type="checkbox" defaultChecked={settings?.internal_only_contact ?? false} /> Restrict contact details to internal users
            </label>
          </div>

          {(isDoctor || isBilling || isCredentialing) && (
            <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, background: '#fbfdfc' }}>
              <h3 style={{ margin: 0 }}>Role-specific profile fields</h3>
              <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
                Values are comma-separated where multiple entries are supported.
              </p>

              {isDoctor && (
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>NPI</span>
                    <input className="field" name="provider_npi" defaultValue={settings?.provider_npi ?? ''} maxLength={32} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>License state</span>
                    <input className="field" name="provider_license_state" defaultValue={settings?.provider_license_state ?? ''} maxLength={16} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>License number</span>
                    <input className="field" name="provider_license_number" defaultValue={settings?.provider_license_number ?? ''} maxLength={48} />
                  </label>
                  <label style={{ display: 'grid', gap: 6, gridColumn: '1 / -1' }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Board certifications</span>
                    <input className="field" name="provider_board_certifications" defaultValue={formatArray(settings?.provider_board_certifications)} />
                  </label>
                </div>
              )}

              {isBilling && (
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Payer focus</span>
                    <input className="field" name="billing_payer_focus" defaultValue={formatArray(settings?.billing_payer_focus)} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Coding certifications</span>
                    <input className="field" name="billing_certifications" defaultValue={formatArray(settings?.billing_certifications)} />
                  </label>
                </div>
              )}

              {isCredentialing && (
                <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Credentialing domains</span>
                    <input className="field" name="credentialing_domains" defaultValue={formatArray(settings?.credentialing_domains)} />
                  </label>
                  <label style={{ display: 'grid', gap: 6 }}>
                    <span style={{ fontSize: 13, color: 'var(--muted)' }}>Regions</span>
                    <input className="field" name="credentialing_regions" defaultValue={formatArray(settings?.credentialing_regions)} />
                  </label>
                </div>
              )}
            </div>
          )}

          <div style={{ border: '1px solid var(--line)', borderRadius: 12, padding: 12, display: 'grid', gap: 10, background: '#fbfdfc' }}>
            <h3 style={{ margin: 0 }}>Professional links</h3>
            <p style={{ margin: 0, color: 'var(--muted)', fontSize: 13 }}>
              Optional links shown in your professional profile.
            </p>
            <div style={{ display: 'grid', gap: 10, gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))' }}>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>LinkedIn URL</span>
                <input className="field" name="linkedin_url" type="url" defaultValue={settings?.linkedin_url ?? ''} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Publications URL</span>
                <input className="field" name="publications_url" type="url" defaultValue={settings?.publications_url ?? ''} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>CV URL</span>
                <input className="field" name="cv_url" type="url" defaultValue={settings?.cv_url ?? ''} />
              </label>
              <label style={{ display: 'grid', gap: 6 }}>
                <span style={{ fontSize: 13, color: 'var(--muted)' }}>Credential docs URL</span>
                <input className="field" name="credential_docs_url" type="url" defaultValue={settings?.credential_docs_url ?? ''} />
              </label>
            </div>
          </div>

          <div>
            <button className="btn btn-primary" type="submit">Save preferences</button>
          </div>
        </form>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Data Export</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Download a copy of your account data.
        </p>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
          <a className="btn btn-secondary" href="/api/profile/export">Download account export</a>
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Onboarding Completion</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Profile setup progress based on your active role requirements.
        </p>

        <div style={{ marginBottom: 10 }}>
          <p style={{ margin: 0, fontWeight: 700 }}>{completedOnboarding}/{onboardingItems.length} complete ({onboardingPercent}%)</p>
          <div style={{ marginTop: 6, background: '#e8f0ec', borderRadius: 999, overflow: 'hidden' }}>
            <div style={{ height: 10, width: `${onboardingPercent}%`, background: 'var(--accent)' }} />
          </div>
        </div>

        <div style={{ display: 'grid', gap: 8 }}>
          {onboardingItems.map((item) => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 14 }}>
              <span
                style={{
                  display: 'inline-flex',
                  width: 18,
                  height: 18,
                  borderRadius: '50%',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: item.done ? 'rgba(11, 124, 69, 0.18)' : 'rgba(0, 0, 0, 0.08)',
                  color: item.done ? 'var(--ok)' : 'var(--muted)',
                  fontSize: 12,
                  fontWeight: 700,
                }}
              >
                {item.done ? '✓' : '!'}
              </span>
              <span style={{ color: item.done ? 'var(--ink)' : 'var(--muted)' }}>{item.label}</span>
            </div>
          ))}
        </div>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Email and Sessions</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Manage your login email and revoke access from other active sessions.
        </p>

        {(emailError || emailSuccess) && (
          <p
            style={{
              margin: '0 0 10px',
              color: emailError ? 'var(--warning)' : 'var(--ok)',
              background: emailError ? 'rgba(180, 74, 46, 0.1)' : 'rgba(11, 124, 69, 0.1)',
              border: emailError ? '1px solid rgba(180, 74, 46, 0.28)' : '1px solid rgba(11, 124, 69, 0.28)',
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            {emailError || emailSuccess}
          </p>
        )}

        <form action={updateEmail} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>New login email</span>
            <input className="field" name="email" type="email" defaultValue={profile?.email ?? user.email ?? ''} required />
          </label>
          <div>
            <button className="btn btn-primary" type="submit">Change email</button>
          </div>
        </form>

        {(sessionError || sessionSuccess) && (
          <p
            style={{
              margin: '12px 0 10px',
              color: sessionError ? 'var(--warning)' : 'var(--ok)',
              background: sessionError ? 'rgba(180, 74, 46, 0.1)' : 'rgba(11, 124, 69, 0.1)',
              border: sessionError ? '1px solid rgba(180, 74, 46, 0.28)' : '1px solid rgba(11, 124, 69, 0.28)',
              borderRadius: 10,
              padding: '8px 10px',
            }}
          >
            {sessionError || sessionSuccess}
          </p>
        )}

        <form action={revokeOtherSessions}>
          <button className="btn btn-secondary" type="submit">Sign out other sessions</button>
        </form>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Change Password</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Use a strong password with at least 8 characters.
        </p>

        {passwordError && (
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
            {passwordError}
          </p>
        )}

        {passwordSuccess && (
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
            {passwordSuccess}
          </p>
        )}

        <form action={updatePassword} style={{ display: 'grid', gap: 12, maxWidth: 520 }}>
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>New password</span>
            <input
              className="field"
              name="password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>

          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 13, color: 'var(--muted)' }}>Confirm new password</span>
            <input
              className="field"
              name="confirm_password"
              type="password"
              minLength={8}
              autoComplete="new-password"
              required
            />
          </label>

          <div>
            <button className="btn btn-primary" type="submit">
              Update password
            </button>
          </div>
        </form>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Security Activity</h2>
        <p style={{ marginTop: 0, color: 'var(--muted)', fontSize: 14 }}>
          Recent security-relevant actions on your account.
        </p>
        {auditRows && auditRows.length > 0 ? (
          <div style={{ display: 'grid', gap: 8 }}>
            {auditRows.map((entry) => (
              <article
                key={entry.id}
                style={{
                  border: '1px solid var(--line)',
                  borderRadius: 12,
                  padding: 10,
                  background: '#fbfdfc',
                }}
              >
                <p style={{ margin: 0, fontWeight: 700 }}>{entry.action.replaceAll('_', ' ')}</p>
                <p style={{ margin: '3px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                  {new Date(entry.created_at).toLocaleString()}
                </p>
                <p style={{ margin: '5px 0 0', color: 'var(--muted)', fontSize: 12 }}>
                  {JSON.stringify(entry.metadata)}
                </p>
              </article>
            ))}
          </div>
        ) : (
          <p style={{ margin: 0, color: 'var(--muted)' }}>No security activity yet.</p>
        )}
      </article>
    </section>
  )
}
