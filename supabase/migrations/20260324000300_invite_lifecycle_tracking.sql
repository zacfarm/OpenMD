-- Invite lifecycle tracking: sent/opened/accepted/expired and explicit expiration action.
-- Invitations automatically expire after 48 hours unless accepted.

ALTER TABLE public.tenant_invites
  ADD COLUMN IF NOT EXISTS opened_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz;

-- Update default expiration from 14 days to 48 hours for new invites
ALTER TABLE public.tenant_invites
  ALTER COLUMN expires_at SET DEFAULT (now() + interval '48 hours');

ALTER TABLE public.tenant_invites
  DROP CONSTRAINT IF EXISTS tenant_invites_status_check;

ALTER TABLE public.tenant_invites
  ADD CONSTRAINT tenant_invites_status_check
  CHECK (status IN ('pending', 'opened', 'accepted', 'expired'));

CREATE OR REPLACE FUNCTION public.mark_tenant_invite_opened(invite_token_input text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF coalesce(trim(invite_token_input), '') = '' THEN
    RETURN;
  END IF;

  UPDATE public.tenant_invites
  SET
    status = CASE WHEN status = 'pending' THEN 'opened' ELSE status END,
    opened_at = coalesce(opened_at, now())
  WHERE invite_token = invite_token_input
    AND status IN ('pending', 'opened')
    AND expires_at > now();
END;
$$;

CREATE OR REPLACE FUNCTION public.expire_tenant_invite(invite_id_input uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.tenant_invites;
  caller_role public.tenant_role;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  SELECT * INTO invite_row
  FROM public.tenant_invites
  WHERE id = invite_id_input
  LIMIT 1;

  IF invite_row.id IS NULL THEN
    RAISE EXCEPTION 'Invite not found';
  END IF;

  caller_role := public.current_tenant_role(invite_row.tenant_id);

  IF caller_role NOT IN ('admin', 'facility_manager') THEN
    RAISE EXCEPTION 'Only admins and facility managers can expire invites';
  END IF;

  UPDATE public.tenant_invites
  SET status = 'expired', expires_at = now()
  WHERE id = invite_row.id
    AND status <> 'accepted';
END;
$$;

CREATE OR REPLACE FUNCTION public.accept_tenant_invite(invite_token_input text)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  invite_row public.tenant_invites;
  current_full_name text;
  current_email text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Must be signed in';
  END IF;

  SELECT p.full_name, p.email
    INTO current_full_name, current_email
  FROM public.profiles p
  WHERE p.id = auth.uid();

  SELECT * INTO invite_row
  FROM public.tenant_invites ti
  WHERE ti.invite_token = invite_token_input
    AND ti.status IN ('pending', 'opened')
    AND ti.expires_at > now()
    AND ti.email = lower(coalesce(current_email, ''))
  ORDER BY ti.created_at desc
  LIMIT 1;

  IF invite_row.id IS NULL THEN
    RAISE EXCEPTION 'Invite is invalid or expired';
  END IF;

  INSERT INTO public.tenant_memberships (tenant_id, user_id, role, invited_by)
  VALUES (invite_row.tenant_id, auth.uid(), invite_row.role, invite_row.invited_by)
  ON CONFLICT (tenant_id, user_id)
  DO UPDATE SET role = excluded.role;

  IF invite_row.role = 'doctor' THEN
    INSERT INTO public.provider_profiles (
      user_id,
      display_name,
      specialty,
      practice_tenant_id,
      is_public
    )
    VALUES (
      auth.uid(),
      coalesce(nullif(trim(current_full_name), ''), split_part(coalesce(current_email, 'Provider'), '@', 1), 'Provider'),
      null,
      invite_row.tenant_id,
      true
    )
    ON CONFLICT (user_id)
    DO NOTHING;
  END IF;

  UPDATE public.tenant_invites
  SET status = 'accepted', accepted_at = now()
  WHERE id = invite_row.id;

  RETURN invite_row.tenant_id;
END;
$$;
