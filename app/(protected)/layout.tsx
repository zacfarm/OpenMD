import Link from "next/link";
import { redirect } from "next/navigation";

import { getGlobalAdminAccess } from "@/lib/openmdAdmin";
import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { hasPermission, getRoleLabel, normalizeTenantRole } from "@/lib/rbac";

export default async function ProtectedLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const [
    { data: memberships },
    { count: unreadCount },
    { data: messageUnreadCount },
    { data: profile },
    { data: profileSettings },
  ] = await Promise.all([
    supabase
      .from("tenant_memberships")
      .select("tenant_id,role,tenants(name,org_type)")
      .eq("user_id", user.id)
      .limit(1),
    supabase
      .from("notifications")
      .select("id", { count: "exact", head: true })
      .eq("user_id", user.id)
      .eq("status", "unread"),
    supabase.rpc("unread_message_threads_count"),
    supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("user_profile_settings")
      .select("avatar_path")
      .eq("user_id", user.id)
      .maybeSingle(),
  ]);

  const active = memberships?.[0];
  const activeTenant = Array.isArray(active?.tenants)
    ? active.tenants[0]
    : active?.tenants;
  const adminAccess = await getGlobalAdminAccess();
  const role = active?.role ?? null;
  const normalizedRole = normalizeTenantRole(role);
  const avatarPath = profileSettings?.avatar_path ?? null;
  const avatarFallback = (profile?.full_name || user.email || "U")
    .slice(0, 1)
    .toUpperCase();

  let avatarUrl: string | null = null;
  if (avatarPath) {
    const { data } = await supabase.storage
      .from("profile-avatars")
      .createSignedUrl(avatarPath, 60 * 60);
    avatarUrl = data?.signedUrl ?? null;
  }

  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="container app-header-inner">
          <div className="app-brand-wrap">
            <Link
              href="/dashboard"
              className="app-brand"
              aria-label="OpenMD Dashboard"
            >
              OpenMD
            </Link>
            <span className="app-workspace-pill">
              {activeTenant?.name ?? "No workspace"} • {getRoleLabel(role)}
            </span>
          </div>

          <nav className="app-nav" aria-label="Primary">
            <Link href="/dashboard" className="app-nav-link">
              Dashboard
            </Link>
            {hasPermission(role, "view_bookings") &&
              normalizedRole !== "billing" && (
                <Link href="/bookings" className="app-nav-link">
                  Bookings
                </Link>
              )}
            {hasPermission(role, "view_bookings") && (
              <Link href="/calendar" className="app-nav-link">
                Calendar
              </Link>
            )}
            {hasPermission(role, "view_providers") &&
              normalizedRole !== "billing" && (
                <Link href="/providers" className="app-nav-link">
                  Providers
                </Link>
              )}
            {hasPermission(role, "view_billing") && (
              <Link href="/billing" className="app-nav-link">
                Billing
              </Link>
            )}
            {hasPermission(role, "view_notifications") && (
              <Link
                href="/notifications"
                className="app-nav-link app-nav-link-notifications"
              >
                Notifications
                {unreadCount != null && unreadCount > 0 && (
                  <span className="app-notification-count">{unreadCount}</span>
                )}
              </Link>
            )}
            <Link
              href="/messages"
              className="app-nav-link app-nav-link-notifications"
            >
              Messages
              {typeof messageUnreadCount === "number" &&
                messageUnreadCount > 0 && (
                  <span className="app-notification-count">
                    {messageUnreadCount}
                  </span>
                )}
            </Link>
            {hasPermission(role, "view_credentials") &&
              normalizedRole !== "credentialing" && (
                <Link href="/credentials" className="app-nav-link">
                  Credentials
                </Link>
              )}
            {hasPermission(role, "manage_team") && (
              <Link href="/settings/team" className="app-nav-link">
                Team
              </Link>
            )}
            {(adminAccess.isGlobalAdmin || adminAccess.needsBootstrap) && (
              <Link href="/admin" className="app-nav-link">
                Admin
              </Link>
            )}
          </nav>

          <div className="app-header-actions">
            <Link
              href="/settings/profile"
              className="app-profile-avatar-link"
              aria-label="Open profile settings"
              title="Profile settings"
            >
              {avatarUrl ? (
                <img
                  src={avatarUrl}
                  alt="Profile avatar"
                  className="app-profile-avatar-image"
                />
              ) : (
                <span
                  className="app-profile-avatar-fallback"
                  aria-hidden="true"
                >
                  {avatarFallback}
                </span>
              )}
            </Link>
            <form action="/logout" method="post" className="app-logout-form">
              <button className="btn btn-secondary" type="submit">
                Logout
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container" style={{ padding: "26px 0 40px" }}>
        {children}
      </main>
    </div>
  );
}
