import { NextResponse } from 'next/server'

import { containsPotentialPhi, REVIEW_TAGS } from '@/lib/openmd'
import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  const referer = req.headers.get('referer')
  const form = await req.formData()
  const entityId = String(form.get('entityId') || '')
  const starRating = Number(form.get('starRating'))
  const tags = form
    .getAll('tags')
    .map((value) => String(value))
    .filter((tag) => REVIEW_TAGS.includes(tag as (typeof REVIEW_TAGS)[number]))
  const commentRaw = String(form.get('comment') || '').trim()

  if (!entityId || !Number.isInteger(starRating) || starRating < 1 || starRating > 5) {
    return NextResponse.redirect(new URL(referer ?? '/', req.url))
  }

  if (commentRaw && (commentRaw.length < 20 || commentRaw.length > 800 || containsPotentialPhi(commentRaw))) {
    return NextResponse.redirect(new URL(referer ?? '/', req.url))
  }

  const supabase = createSupabaseServerClient()
  const { data: entity } = await supabase
    .from('directory_entities')
    .select('entity_type,slug')
    .eq('id', entityId)
    .single()

  if (!entity) {
    return NextResponse.redirect(new URL('/', req.url))
  }

  await supabase.from('directory_reviews').insert({
    entity_id: entityId,
    star_rating: starRating,
    tags,
    comment: commentRaw || null,
  })

  return NextResponse.redirect(new URL(`/directory/${entity.entity_type}/${entity.slug}`, req.url))
}
