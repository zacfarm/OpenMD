'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function LoginPage() {
  const supabase = createSupabaseBrowserClient()
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setBusy(true)

    const data = new FormData(event.currentTarget)
    const email = String(data.get('email') || '')
    const password = String(data.get('password') || '')

    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password })
    setBusy(false)

    if (signInError) {
      setError(signInError.message)
      return
    }

    router.replace('/dashboard')
    router.refresh()
  }

  return (
    <div className="auth-form-wrap">
      <header className="auth-heading">
        <p className="auth-kicker">Welcome Back</p>
        <h1>Sign in to OpenMD</h1>
        <p>Manage tenant workflows, providers, bookings, and notifications in one place.</p>
      </header>

      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          Email
          <input name="email" type="email" className="field auth-input" required autoComplete="email" />
        </label>

        <label className="auth-label">
          Password
          <input
            name="password"
            type="password"
            className="field auth-input"
            required
            autoComplete="current-password"
          />
        </label>

        {error && <p className="auth-error">{error}</p>}

        <Link href="/forgot-password" className="auth-inline-link">
          Forgot password?
        </Link>

        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p className="auth-switch">
        Need an account? <Link href="/signup">Create tenant workspace</Link>
      </p>
    </div>
  )
}
