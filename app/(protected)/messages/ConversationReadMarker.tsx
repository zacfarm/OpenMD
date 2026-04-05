'use client'

import { useEffect } from 'react'

import { createSupabaseBrowserClient } from '@/lib/supabaseBrowser'

export function ConversationReadMarker({ conversationId }: { conversationId: string }) {
  useEffect(() => {
    const supabase = createSupabaseBrowserClient()

    void supabase
      .from('message_conversation_participants')
      .update({ last_read_at: new Date().toISOString() })
      .eq('conversation_id', conversationId)
  }, [conversationId])

  return null
}