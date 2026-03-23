-- ============================================================
-- Professional Links


alter table public.user_profile_settings
  add column if not exists linkedin_url text,
  add column if not exists publications_url text,
  add column if not exists cv_url text,
  add column if not exists credential_docs_url text;