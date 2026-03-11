import { type TenantRole, hasPermission } from './rbac'

export type { TenantRole }
export type OrgType = 'practice' | 'facility' | 'independent_doctor'
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'confirmed' | 'canceled'

export type DirectoryEntityType = 'doctor' | 'facility' | 'practice'

/** @deprecated Use hasPermission(role, 'create_booking') from lib/rbac instead. */
export function roleCanRequestBookings(role: TenantRole | string) {
  return hasPermission(role, 'create_booking')
}

/** @deprecated Use getRoleLabel from lib/rbac instead. */
export function displayRole(role: string) {
  return role.replace(/_/g, ' ')
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
