-- Fix incorrect uniqueness on tenant_memberships.
-- Symptom:
--   duplicate key value violates unique constraint "tenant_memberships_tenant_id_unique"
-- Cause:
--   A unique constraint/index exists on tenant_id alone, which allows only one
--   membership row per tenant.
-- Expected:
--   Uniqueness must be (tenant_id, user_id) so a tenant can have many members
--   while each user appears at most once per tenant.

DO $$
BEGIN
  -- Drop incorrect table-level unique constraint if present.
  IF EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'tenant_memberships_tenant_id_unique'
      AND conrelid = 'public.tenant_memberships'::regclass
  ) THEN
    ALTER TABLE public.tenant_memberships
      DROP CONSTRAINT tenant_memberships_tenant_id_unique;
  END IF;

  -- Drop incorrect unique index if present.
  IF EXISTS (
    SELECT 1
    FROM pg_indexes
    WHERE schemaname = 'public'
      AND tablename = 'tenant_memberships'
      AND indexname = 'tenant_memberships_tenant_id_unique'
  ) THEN
    DROP INDEX public.tenant_memberships_tenant_id_unique;
  END IF;

  -- Ensure the correct unique constraint exists.
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conrelid = 'public.tenant_memberships'::regclass
      AND contype = 'u'
      AND pg_get_constraintdef(oid) = 'UNIQUE (tenant_id, user_id)'
  ) THEN
    ALTER TABLE public.tenant_memberships
      ADD CONSTRAINT tenant_memberships_tenant_user_unique
      UNIQUE (tenant_id, user_id);
  END IF;
END
$$;
