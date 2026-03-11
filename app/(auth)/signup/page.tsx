'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseClient'
import type { OrgType } from '@/lib/openmd'

export default function SignupPage() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

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
    const inviteToken = String(data.get('inviteToken') || '').trim()

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
    <>
      <h1 style={{ marginTop: 0, fontSize: 30 }}>Create OpenMD workspace</h1>
      <p style={{ color: 'var(--muted)' }}>
        Supports practice or facility tenants with role-based access. Independent providers should register as a practice.
      </p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        <label>
          Full name
          <input className="field" name="fullName" required />
        </label>

        <label>
          Email
          <input className="field" name="email" type="email" autoComplete="email" required />
        </label>

        <label>
          Password
          <input className="field" name="password" type="password" autoComplete="new-password" required minLength={8} />
        </label>

        <label>
          Organization name
          <input className="field" name="orgName" placeholder="Riverside Medical Group" />
        </label>

        <label>
          Organization type
          <select className="field" name="orgType" defaultValue="practice" required>
            <option value="practice">Practice</option>
            <option value="facility">Facility</option>
          </select>
        </label>

        <label>
          Invite token (optional, use this to join an existing tenant)
          <input className="field" name="inviteToken" />
        </label>

        {error && <p style={{ color: 'var(--warning)', margin: 0 }}>{error}</p>}

        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? 'Creating...' : 'Create account'}
        </button>
      </form>

      <p style={{ marginBottom: 0 }}>
        Already have an account? <Link href="/login">Sign in</Link>
      </p>
    </>
  )
}
