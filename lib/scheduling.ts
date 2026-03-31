export const DEFAULT_SCHEDULE_DOCUMENT_TYPES = [
  'Medical Records',
  'Face Sheet',
  'Payment',
  'Appeal',
  'Insurance Correspondence',
  'Negotiation',
] as const

export const SCHEDULE_DOCUMENT_ACCEPT = '.pdf,.doc,.docx,.png,.jpg,.jpeg'

export const SCHEDULE_DOCUMENT_MAX_BYTES = 10 * 1024 * 1024
