export type DirectoryEntity = {
  id: string
  entity_type: 'doctor' | 'facility' | 'practice'
  slug: string
  name: string
  specialty: string | null
  location: string | null
  description: string | null
  average_rating: number
  rating_count: number
}
