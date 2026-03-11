
ALTER TABLE public.tenant_memberships
  ADD CONSTRAINT tenant_memberships_user_id_profile_fkey
  FOREIGN KEY (user_id) REFERENCES public.profiles(id) ON DELETE CASCADE;


DROP POLICY IF EXISTS "profiles_select_own" ON public.profiles;

CREATE POLICY "profiles_select_own_or_cotenant" ON public.profiles
  FOR SELECT USING (
    auth.uid() = id
    OR
    EXISTS (
      SELECT 1
      FROM   public.tenant_memberships tm_me
      JOIN   public.tenant_memberships tm_them
             ON tm_them.tenant_id = tm_me.tenant_id
      WHERE  tm_me.user_id   = auth.uid()
        AND  tm_them.user_id = profiles.id
    )
  );


DROP POLICY IF EXISTS "tenant_memberships_select_own_or_admin" ON public.tenant_memberships;

CREATE POLICY "tenant_memberships_select_own_or_admin" ON public.tenant_memberships
  FOR SELECT USING (
    user_id = auth.uid()
    OR public.current_tenant_role(tenant_id) IN ('admin', 'facility_manager')
  );


DROP POLICY IF EXISTS "tenant_memberships_manage_admin" ON public.tenant_memberships;

CREATE POLICY "tenant_memberships_manage_admin" ON public.tenant_memberships
  FOR ALL
  USING      (public.current_tenant_role(tenant_id) IN ('admin', 'facility_manager'))
  WITH CHECK (public.current_tenant_role(tenant_id) IN ('admin', 'facility_manager'));


DROP POLICY IF EXISTS "tenant_invites_manage_admin" ON public.tenant_invites;

CREATE POLICY "tenant_invites_manage_admin" ON public.tenant_invites
  FOR ALL
  USING      (public.current_tenant_role(tenant_id) IN ('admin', 'facility_manager'))
  WITH CHECK (public.current_tenant_role(tenant_id) IN ('admin', 'facility_manager'));
