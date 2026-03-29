export const CREDENTIAL_TYPES = [
  "DEA License",
  "Medical License",
  "Board Certification",
  "Malpractice Insurance",
  "NPI Registration",
  "ACLS/BLS Certification",
  "CME Certificate",
  "Other",
] as const;

export const REQUIRED_CREDENTIAL_TYPES = [
  "DEA License",
  "Medical License",
  "Board Certification",
  "Malpractice Insurance",
  "NPI Registration",
] as const;

export const CREDENTIAL_EXPIRY_REMINDER_DAYS = [90, 60, 30, 7] as const;
