import { type TenantRole, hasPermission } from './rbac'

export type { TenantRole }
export type OrgType = 'practice' | 'facility' | 'independent_doctor'
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'confirmed' | 'canceled'

export const REVIEW_TAGS = [
  'communication',
  'wait_time',
  'staff_professionalism',
  'billing_clarity',
  'facility_cleanliness',
] as const

/** @deprecated Use hasPermission(role, 'create_booking') from lib/rbac instead. */
export function roleCanRequestBookings(role: TenantRole | string) {
  return hasPermission(role, 'create_booking')
}

/** @deprecated Use getRoleLabel from lib/rbac instead. */
export function displayRole(role: string) {
  return role.replace(/_/g, ' ')
}

export function containsPotentialPhi(text: string) {
  const lowered = text.toLowerCase()
  const blockedTerms = ['mrn', 'dob', 'diagnosis', 'ssn', 'policy number', 'insurance id']
  return blockedTerms.some((term) => lowered.includes(term))
}
