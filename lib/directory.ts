import type { DirectoryEntityType } from './openmd'
import { createSupabaseServerClient } from './supabaseServer'

export type ReviewTagOption = {
  id: string
  entity_type: DirectoryEntityType
  slug: string
  label: string
  sort_order: number
  is_active: boolean
}

export async function getActiveReviewTags(entityType: DirectoryEntityType) {
  const supabase = createSupabaseServerClient()
  const { data } = await supabase
    .from('review_tag_options')
    .select('id,entity_type,slug,label,sort_order,is_active')
    .eq('entity_type', entityType)
    .eq('is_active', true)
    .order('sort_order', { ascending: true })
    .order('label', { ascending: true })

  return (data ?? []) as ReviewTagOption[]
}
