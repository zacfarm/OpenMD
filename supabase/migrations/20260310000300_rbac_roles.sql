-- =============================================================
-- RBAC Roles Migration
-- Introduces four distinct operational roles:
--   doctor          (renamed from provider)
--   credentialing   (renamed from scheduler)
--   facility_manager (new)
--   billing         (unchanged)
--   admin           (unchanged - full access)
-- =============================================================

-- 1. Rename existing enum values in-place.
--    PostgreSQL 10+: RENAME VALUE automatically updates every
--    table column that stores the renamed value, so no UPDATE
--    statements are needed.
ALTER TYPE public.tenant_role RENAME VALUE 'provider'  TO 'doctor';
ALTER TYPE public.tenant_role RENAME VALUE 'scheduler' TO 'credentialing';

-- 2. Add the new facility_manager value.
ALTER TYPE public.tenant_role ADD VALUE IF NOT EXISTS 'facility_manager';

-- 3. Re-create create_tenant_invite so that facility_manager
--    members can also invite teammates (previously admin-only).
CREATE OR REPLACE FUNCTION public.create_tenant_invite(
  target_tenant uuid,
  invite_email  text,
  invite_role   public.tenant_role
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  generated_token text;
  caller_role     public.tenant_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  caller_role := public.current_tenant_role(target_tenant);

  IF caller_role NOT IN ('admin', 'facility_manager') THEN
    RAISE EXCEPTION 'Only admins and facility managers can invite users';
  END IF;

  generated_token :=
    md5(random()::text || clock_timestamp()::text || auth.uid()::text || lower(trim(invite_email))) ||
    md5(clock_timestamp()::text || random()::text || lower(trim(invite_email)));

  INSERT INTO public.tenant_invites (tenant_id, email, role, invite_token, invited_by)
  VALUES (target_tenant, lower(trim(invite_email)), invite_role, generated_token, auth.uid());

  RETURN generated_token;
END;
$$;

-- 4. Permission helper function.
--    Maps each named permission to the set of roles that hold it.
--    Used by RLS policies and server-side guards.
CREATE OR REPLACE FUNCTION public.tenant_role_has_permission(
  p_role       public.tenant_role,
  p_permission text
)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
AS $$
BEGIN
  RETURN CASE p_permission
    WHEN 'view_dashboard'          THEN p_role IN ('admin','doctor','facility_manager','billing','credentialing')
    WHEN 'view_bookings'           THEN p_role IN ('admin','doctor','facility_manager','billing','credentialing')
    WHEN 'create_booking'          THEN p_role IN ('admin','doctor','facility_manager','credentialing')
    WHEN 'manage_bookings'         THEN p_role IN ('admin','facility_manager','credentialing')
    WHEN 'view_providers'          THEN p_role IN ('admin','doctor','facility_manager','billing','credentialing')
    WHEN 'manage_providers'        THEN p_role IN ('admin','facility_manager','credentialing')
    WHEN 'view_billing'            THEN p_role IN ('admin','facility_manager','billing')
    WHEN 'manage_billing'          THEN p_role IN ('admin','billing')
    WHEN 'view_credentials'        THEN p_role IN ('admin','doctor','facility_manager','credentialing')
    WHEN 'manage_credentials'      THEN p_role IN ('admin','facility_manager','credentialing')
    WHEN 'view_notifications'      THEN p_role IN ('admin','doctor','facility_manager','billing','credentialing')
    WHEN 'manage_team'             THEN p_role IN ('admin','facility_manager')
    WHEN 'view_marketplace'        THEN p_role IN ('admin','doctor','facility_manager','billing','credentialing')
    WHEN 'create_marketplace_post' THEN p_role IN ('admin','doctor','facility_manager','credentialing')
    WHEN 'manage_availability'     THEN p_role IN ('admin','doctor','facility_manager','credentialing')
    ELSE false
  END;
END;
$$;

COMMENT ON FUNCTION public.tenant_role_has_permission IS
  'Returns true when p_role grants p_permission. Mirrors ROLE_PERMISSIONS in lib/rbac.ts.';

GRANT EXECUTE ON FUNCTION public.tenant_role_has_permission(public.tenant_role, text) TO authenticated;
