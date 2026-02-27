export type OrgType = 'practice' | 'facility' | 'independent_doctor'
export type TenantRole = 'admin' | 'scheduler' | 'billing' | 'provider'
export type BookingStatus = 'requested' | 'accepted' | 'declined' | 'confirmed' | 'canceled'

export const REVIEW_TAGS = [
  'communication',
  'wait_time',
  'staff_professionalism',
  'billing_clarity',
  'facility_cleanliness',
] as const

export function roleCanRequestBookings(role: TenantRole) {
  return role === 'admin' || role === 'scheduler'
}

export function displayRole(role: string) {
  return role.replace('_', ' ')
}

export function containsPotentialPhi(text: string) {
  const lowered = text.toLowerCase()
  const blockedTerms = ['mrn', 'dob', 'diagnosis', 'ssn', 'policy number', 'insurance id']
  return blockedTerms.some((term) => lowered.includes(term))
}
