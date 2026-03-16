'use client'

import { useRouter, useSearchParams } from 'next/navigation'
import { useEffect, useMemo, useState } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseClient'

export default function ResetPasswordPage() {
  const supabase = useMemo(() => createSupabaseBrowserClient(), [])
  const router = useRouter()
  const searchParams = useSearchParams()
  const [password, setPassword] = useState('')
  const [confirmPassword, setConfirmPassword] = useState('')
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState<string | null>(null)

  useEffect(() => {
    let isMounted = true

    async function prepareRecoverySession() {
      const hashParams = new URLSearchParams(window.location.hash.replace(/^#/, ''))
      const hashAccessToken = hashParams.get('access_token')
      const hashRefreshToken = hashParams.get('refresh_token')
      const authCode = searchParams.get('code')
      const tokenHash = searchParams.get('token_hash')
      const recoveryType = searchParams.get('type')

      if (hashAccessToken && hashRefreshToken) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: hashAccessToken,
          refresh_token: hashRefreshToken,
        })
        if (setSessionError && isMounted) {
          setError(setSessionError.message)
        }
      } else if (tokenHash && recoveryType === 'recovery') {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          type: 'recovery',
          token_hash: tokenHash,
        })
        if (verifyError && isMounted) {
          setError(verifyError.message)
        }
      } else if (authCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(authCode)
        if (exchangeError && isMounted) {
          if (exchangeError.message.includes('both auth code and code verifier should be non-empty')) {
            setError(
              'This reset link depends on a browser code verifier. Request a new reset link and open it in the same browser where you clicked Forgot password.',
            )
          } else {
            setError(exchangeError.message)
          }
        }
      }

      const { data, error: sessionError } = await supabase.auth.getSession()
      if (!isMounted) {
        return
      }

      if (sessionError) {
        setError(sessionError.message)
      } else if (!data.session) {
        setError('Reset link is invalid or expired. Request a new password reset from sign in.')
      }

      setReady(true)
    }

    prepareRecoverySession()

    return () => {
      isMounted = false
    }
  }, [searchParams, supabase])

  async function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    setSuccess(null)

    if (password.length < 8) {
      setError('Password must be at least 8 characters.')
      return
    }

    if (password !== confirmPassword) {
      setError('Passwords do not match.')
      return
    }

    setBusy(true)
    const { error: updateError } = await supabase.auth.updateUser({ password })
    setBusy(false)

    if (updateError) {
      setError(updateError.message)
      return
    }

    setSuccess('Password updated. Redirecting to sign in...')
    window.setTimeout(() => {
      router.replace('/login')
      router.refresh()
    }, 800)
  }

  return (
    <div className="auth-form-wrap">
      <header className="auth-heading">
        <p className="auth-kicker">Account Recovery</p>
        <h1>Set a new password</h1>
        <p>Use a strong password with at least 8 characters.</p>
      </header>

      <form className="auth-form" onSubmit={onSubmit}>
        <label className="auth-label">
          New password
          <input
            className="field auth-input"
            name="password"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={password}
            onChange={(event) => setPassword(event.currentTarget.value)}
            disabled={!ready || busy}
          />
        </label>

        <label className="auth-label">
          Confirm new password
          <input
            className="field auth-input"
            name="confirmPassword"
            type="password"
            autoComplete="new-password"
            minLength={8}
            required
            value={confirmPassword}
            onChange={(event) => setConfirmPassword(event.currentTarget.value)}
            disabled={!ready || busy}
          />
        </label>

        {error && <p className="auth-error">{error}</p>}
        {success && <p className="auth-success">{success}</p>}

        <button className="btn btn-primary auth-submit" type="submit" disabled={!ready || busy}>
          {busy ? 'Updating password...' : 'Update password'}
        </button>
      </form>
    </div>
  )
}
