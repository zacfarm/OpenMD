'use client'

import Link from 'next/link'
import { useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function ForgotPasswordPage() {
  const supabase = createSupabaseBrowserClient()
  const [email, setEmail] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    const normalizedEmail = email.trim()
    if (!normalizedEmail) {
      setError('Please enter your email address.')
      return
    }

    setBusy(true)
    const redirectTo = `${window.location.origin}/reset-password`
    const { error: resetRequestError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, { redirectTo })
    setBusy(false)

    if (resetRequestError) {
      setError(resetRequestError.message)
      return
    }

    setSuccess('Reset link sent. Check your inbox and follow the link to continue.')
  }

  return (
    <div className="auth-form-wrap">
      <header className="auth-heading">
        <p className="auth-kicker">Account Recovery</p>
        <h1>Forgot your password?</h1>
        <p>Enter your account email and we will send a secure password reset link.</p>
      </header>

      <form onSubmit={onSubmit} className="auth-form">
        <label className="auth-label">
          Email address
          <input
            name="email"
            type="email"
            className="field auth-input"
            required
            autoComplete="email"
            value={email}
            onChange={(event) => setEmail(event.currentTarget.value)}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-success">{success}</p>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={busy}>
          {busy ? 'Sending reset link...' : 'Send reset link'}
        </button>
      </form>

      <p className="auth-switch">
        Remembered your password? <Link href="/login">Back to sign in</Link>
      </p>
    </div>
  )
}
