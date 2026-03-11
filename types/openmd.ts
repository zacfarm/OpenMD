export type DirectoryEntity = {
  id: string
  entity_type: 'doctor' | 'facility' | 'practice'
  parent_entity_id?: string | null
  slug: string
  name: string
  specialty: string | null
  location: string | null
  description: string | null
  average_rating: number
  rating_count: number
}
