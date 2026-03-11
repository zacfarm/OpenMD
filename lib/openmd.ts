export type OrgType = 'practice' | 'facility' | 'independent_doctor'
export type TenantRole = 'admin' | 'scheduler' | 'billing' | 'provider'
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'confirmed' | 'canceled'

export type DirectoryEntityType = 'doctor' | 'facility' | 'practice'

export function roleCanRequestBookings(role: TenantRole) {
  return role === 'admin' || role === 'scheduler'
}

export function displayRole(role: string) {
  return role.replace('_', ' ')
}

export function slugify(value: string) {
  return value
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

export function formatTagLabel(tag: string) {
  return tag.replace(/_/g, ' ')
}

export function formatLocation(city?: string | null, state?: string | null) {
  return [city, state].filter(Boolean).join(', ') || null
}

export function containsPotentialPhi(text: string) {
  const lowered = text.toLowerCase()
  const blockedTerms = ['mrn', 'dob', 'diagnosis', 'ssn', 'policy number', 'insurance id']
  return blockedTerms.some((term) => lowered.includes(term))
}
