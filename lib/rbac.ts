/**
 * lib/rbac.ts
 *
 * Central RBAC module for OpenMD.
 *
 * Roles
 * ─────
 *  admin            – Tenant owner. Full access to every permission.
 *  doctor           – Credentialed provider. Can view resources, manage
 *                     their own availability, and post marketplace offers.
 *  facility_manager – Operates the facility day-to-day. Full operational
 *                     control except direct billing management.
 *  billing          – Handles claims and invoices. Read-only on clinical
 *                     resources; write access to billing data.
 *  credentialing    – Verifies and credentialing providers. Manages provider
 *                     records, schedules, and credentials.
 *
 * Adding a permission
 * ───────────────────
 * 1. Append the key to PERMISSIONS.
 * 2. Add it to each role's array in ROLE_PERMISSIONS.
 * 3. Mirror the change in the DB function
 *    public.tenant_role_has_permission (migration 20260310000300).
 */

export const TENANT_ROLES = [
  'admin',
  'doctor',
  'facility_manager',
  'billing',
  'credentialing',
] as const

// Team invite workflow currently supports these onboarding roles.
export const INVITABLE_TEAM_ROLES = [
  'doctor',
  'billing',
  'credentialing',
] as const

export type TenantRole = (typeof TENANT_ROLES)[number]

export const PERMISSIONS = [
  'view_dashboard',
  'view_bookings',
  'create_booking',
  'manage_bookings',
  'view_providers',
  'manage_providers',
  'view_billing',
  'manage_billing',
  'view_credentials',
  'manage_credentials',
  'view_notifications',
  'manage_team',
  'view_marketplace',
  'create_marketplace_post',
  'manage_availability',
] as const

export type Permission = (typeof PERMISSIONS)[number]

/**
 * Permission matrix.
 * Each role lists the exact permissions it holds.
 * `admin` receives every permission.
 */
export const ROLE_PERMISSIONS: Record<TenantRole, readonly Permission[]> = {
  admin: [...PERMISSIONS],

  doctor: [
    'view_dashboard',
    'view_bookings',
    'create_booking',
    'view_providers',
    'view_credentials',
    'view_notifications',
    'view_marketplace',
    'create_marketplace_post',
    'manage_availability',
  ],

  facility_manager: [
    'view_dashboard',
    'view_bookings',
    'create_booking',
    'manage_bookings',
    'view_providers',
    'manage_providers',
    'view_credentials',
    'manage_credentials',
    'view_notifications',
    'manage_team',
    'view_marketplace',
    'create_marketplace_post',
    'manage_availability',
  ],

  billing: [
    'view_dashboard',
    'view_bookings',
    'view_providers',
    'view_billing',
    'manage_billing',
    'view_notifications',
    'view_marketplace',
  ],

  credentialing: [
    'view_dashboard',
    'view_bookings',
    'create_booking',
    'manage_bookings',
    'view_providers',
    'manage_providers',
    'view_notifications',
    'view_marketplace',
    'create_marketplace_post',
    'manage_availability',
  ],
}

/** Returns true when the given role grants the given permission. */
export function hasPermission(
  role: string | null | undefined,
  permission: Permission,
): boolean {
  const normalized = normalizeTenantRole(role)
  if (!normalized) return false
  const perms = ROLE_PERMISSIONS[normalized]
  return perms ? (perms as readonly string[]).includes(permission) : false
}

export const ROLE_LABELS: Record<TenantRole, string> = {
  admin: 'Admin',
  doctor: 'Provider',
  facility_manager: 'Facility',
  billing: 'Biller',
  credentialing: 'Scheduler',
}

export function normalizeTenantRole(role: string | null | undefined): TenantRole | null {
  if (!role) return null
  if (role === 'provider') return 'doctor'
  if (role === 'scheduler') return 'credentialing'
  if (role in ROLE_LABELS) return role as TenantRole
  return null
}

/** Human-readable label for a role string, falling back to the raw value. */
export function getRoleLabel(role: string | null | undefined): string {
  const normalized = normalizeTenantRole(role)
  if (!normalized) return role ?? 'Unknown'
  return ROLE_LABELS[normalized]
}



