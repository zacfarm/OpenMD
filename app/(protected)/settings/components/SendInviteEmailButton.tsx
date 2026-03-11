'use client'

import { useState } from 'react'

interface SendInviteEmailButtonProps {
  email: string
  token: string
  role: string
  tenantName: string
  disabled?: boolean
}

export function SendInviteEmailButton({
  email,
  token,
  role,
  tenantName,
  disabled = false,
}: SendInviteEmailButtonProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)

  const handleSend = async () => {
    setLoading(true)
    setError(null)
    setSuccess(false)

    try {
      const response = await fetch('/api/send-invite-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          inviteEmail: email,
          inviteToken: token,
          roleLabel: role,
          tenantName,
        }),
      })

      if (!response.ok) {
        const data = await response.json()
        setError(data.error || 'Failed to send email')
        return
      }

      setSuccess(true)
      setTimeout(() => setSuccess(false), 3000)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      {error && <span style={{ fontSize: 12, color: 'var(--warning)' }}>{error}</span>}
      {success && <span style={{ fontSize: 12, color: 'var(--accent)' }}>✓ Sent</span>}
      <button
        className="btn btn-secondary"
        onClick={handleSend}
        disabled={disabled || loading}
        style={{ padding: '6px 12px', fontSize: 12 }}
      >
        {loading ? 'Sending...' : 'Send email'}
      </button>
    </div>
  )
}
