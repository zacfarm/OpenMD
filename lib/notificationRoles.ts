// Role-based notification filters.
// Maps each tenant role to the event types they should see.

export type TenantRole =
  | "admin"
  | "facility_manager"
  | "credentialing"
  | "billing"
  | "doctor";

export const ROLE_EVENT_TYPES: Record<TenantRole, string[]> = {
  admin: [
    "booking_requested",
    "booking_status_changed",
    "credentials",
    "credential_reviewed",
    "credential_expiring",
    "credential_missing",
    "credential_pending_review",
    "marketplace_claimed",
    "billing_claim_submitted",
    "billing_claim_status_changed",
    "invite_accepted",
    "team_member_joined",
    "message_received",
  ],
  facility_manager: [
    "booking_requested",
    "booking_status_changed",
    "credential_reviewed",
    "credential_expiring",
    "credential_missing",
    "credential_pending_review",
    "marketplace_claimed",
    "invite_accepted",
    "team_member_joined",
    "message_received",
  ],
  credentialing: [
    "booking_requested",
    "booking_status_changed",
    "credential_reviewed",
    "credential_expiring",
    "credential_missing",
    "credential_pending_review",
    "marketplace_claimed",
    "invite_accepted",
    "team_member_joined",
    "message_received",
  ],
  billing: [
    "billing_claim_submitted",
    "billing_claim_status_changed",
    "invite_accepted",
    "team_member_joined",
    "message_received",
  ],
  doctor: [
    "booking_requested",
    "booking_status_changed",
    "credential_reviewed",
    "credential_expiring",
    "marketplace_claimed",
    "message_received",
  ],
};

// Get event types visible to a user based on their roles.
export function getVisibleEventTypes(roles: TenantRole[]): Set<string> {
  const visible = new Set<string>();
  for (const role of roles) {
    const eventTypes = ROLE_EVENT_TYPES[role] || [];
    eventTypes.forEach((et) => visible.add(et));
  }
  return visible;
}

// Check if an event type is relevant to the user's roles.
export function isEventTypeVisibleToRoles(
  eventType: string,
  roles: TenantRole[],
): boolean {
  const visible = getVisibleEventTypes(roles);
  return visible.has(eventType);
}

// Friendly label for a role.
export function getRoleLabel(role: TenantRole): string {
  const labels: Record<TenantRole, string> = {
    admin: "Administrator",
    facility_manager: "Facility Manager",
    credentialing: "Credentialing Officer",
    billing: "Billing Specialist",
    doctor: "Doctor",
  };
  return labels[role] || role;
}
