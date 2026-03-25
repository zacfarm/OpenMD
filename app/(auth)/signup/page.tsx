'use client'

import Link from 'next/link'
import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseClient'
import type { OrgType } from '@/lib/openmd'

export default function SignupPage() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const searchParams = useSearchParams()
  const inviteTokenFromQuery = searchParams.get('inviteToken')?.trim() ?? ''
  const isInviteSignup = Boolean(inviteTokenFromQuery)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!inviteTokenFromQuery) return

    void fetch('/api/invites/open', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ inviteToken: inviteTokenFromQuery }),
    })
  }, [inviteTokenFromQuery])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy(true)
    setError(null)

    const data = new FormData(event.currentTarget)
    const fullName = String(data.get('fullName') || '').trim()
    const email = String(data.get('email') || '').trim()
    const password = String(data.get('password') || '')
    const orgName = String(data.get('orgName') || '').trim()
    const orgType = String(data.get('orgType') || '') as OrgType
    const inviteToken = String(data.get('inviteToken') || inviteTokenFromQuery).trim()

    const { data: signUpData, error: signUpError } = await supabase.auth.signUp({
      email,
      password,
      options: {
        data: {
          full_name: fullName,
        },
      },
    })

    if (signUpError) {
      setBusy(false)
      setError(signUpError.message)
      return
    }

    if (!signUpData.user) {
      setBusy(false)
      setError('Signup succeeded but no user was returned. Check auth settings.')
      return
    }

    if (inviteToken) {
      if (!signUpData.session) {
        setBusy(false)
        setError(
          'Account created. Confirm your email, then sign in and open the same invite link again to complete team join.',
        )
        return
      }

      const { error: inviteError } = await supabase.rpc('accept_tenant_invite', {
        invite_token_input: inviteToken,
      })

      setBusy(false)

      if (inviteError) {
        setError(inviteError.message)
        return
      }

      router.replace('/dashboard')
      router.refresh()
      return
    }

    const { error: bootstrapError } = await supabase.rpc('bootstrap_tenant', {
      org_name: orgName,
      org_kind: orgType,
      full_name_input: fullName,
    })

    setBusy(false)

    if (bootstrapError) {
      setError(bootstrapError.message)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="auth-form-wrap">
      <header className="auth-heading">
        <p className="auth-kicker">OpenMD Onboarding</p>
        <h1>Create OpenMD workspace</h1>
        {isInviteSignup ? (
          <p>You are joining an existing OpenMD team. Create your account to activate your profile.</p>
        ) : (
          <p>Set up a practice or facility tenant with role-based access controls. Independent providers should register as a practice.</p>
        )}
      </header>

      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          Full name
          <input className="field auth-input" name="fullName" required />
        </label>

        <label className="auth-label">
          Email
          <input className="field auth-input" name="email" type="email" autoComplete="email" required />
        </label>

        <label className="auth-label">
          Password
          <input
            className="field auth-input"
            name="password"
            type="password"
            autoComplete="new-password"
            required
            minLength={8}
          />
        </label>

        {!isInviteSignup && (
          <div className="auth-split">
            <label className="auth-label">
              Organization name
              <input className="field auth-input" name="orgName" placeholder="Riverside Medical Group" />
            </label>

            <label className="auth-label">
              Organization type
              <select className="field auth-input" name="orgType" defaultValue="practice" required>
                <option value="practice">Practice</option>
                <option value="facility">Facility</option>
              </select>
            </label>
          </div>
        )}

        <label className="auth-label">
          Invite token (optional, use this to join an existing tenant)
          <input
            className="field auth-input"
            name="inviteToken"
            defaultValue={inviteTokenFromQuery}
            readOnly={isInviteSignup}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <button className="btn btn-primary auth-submit" disabled={busy} type="submit">
          {busy ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p className="auth-switch">
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </div>
  )
}
