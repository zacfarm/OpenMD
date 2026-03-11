import { createSupabaseServerClient } from './supabaseServer'

export async function getGlobalAdminAccess() {
  const supabase = createSupabaseServerClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return {
      isGlobalAdmin: false,
      needsBootstrap: false,
      userId: null as string | null,
    }
  }

  const [{ count }, { data: adminRow }] = await Promise.all([
    supabase.from('global_admins').select('user_id', { count: 'exact', head: true }),
    supabase.from('global_admins').select('user_id').eq('user_id', user.id).maybeSingle(),
  ])

  return {
    isGlobalAdmin: Boolean(adminRow),
    needsBootstrap: (count ?? 0) === 0,
    userId: user.id,
  }
}
