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
    <>
      <h1 style={{ marginTop: 0, fontSize: 30 }}>Sign in to OpenMD</h1>
      <p style={{ color: 'var(--muted)' }}>Manage tenant workflows, providers, bookings, and notifications.</p>

      <form onSubmit={onSubmit} style={{ display: 'grid', gap: 12, marginTop: 14 }}>
        <label>
          Email
          <input name="email" type="email" className="field" required autoComplete="email" />
        </label>
        <label>
          Password
          <input name="password" type="password" className="field" required autoComplete="current-password" />
        </label>

        {error && <p style={{ color: 'var(--warning)', margin: 0 }}>{error}</p>}

        <button className="btn btn-primary" type="submit" disabled={busy}>
          {busy ? 'Signing in...' : 'Sign in'}
        </button>
      </form>

      <p style={{ marginBottom: 0 }}>
        Need an account? <Link href="/signup">Create tenant workspace</Link>
      </p>
    </>
  )
}
