import { NextResponse } from 'next/server'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  const referer = req.headers.get('referer')
  const form = await req.formData()
  const reviewId = String(form.get('reviewId') || '')
  const reason = String(form.get('reason') || '').trim()
  const details = String(form.get('details') || '').trim()
  const sourcePath = String(form.get('sourcePath') || '').trim() || null

  if (!reviewId || !reason) {
    return NextResponse.redirect(new URL(referer ?? '/', req.url))
  }

  const supabase = await createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  await supabase.from('directory_review_reports').insert({
    review_id: reviewId,
    reporter_user_id: user?.id ?? null,
    reason,
    details: details || null,
    source_path: sourcePath,
  })

  return NextResponse.redirect(new URL(`${referer ?? '/'}#reviews`, req.url))
}
