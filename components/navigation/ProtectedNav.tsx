"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

import AppNavDropdown from "@/components/navigation/AppNavDropdown";
import { hasPermission, type TenantRole } from "@/lib/rbac";

type Props = {
  role: string | null;
  normalizedRole: TenantRole | null;
  isGlobalAdmin: boolean;
  needsBootstrap: boolean;
  unreadCount: number;
  messageUnreadCount: number;
};

function isPathActive(pathname: string, href: string) {
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function ProtectedNav({
  role,
  normalizedRole,
  isGlobalAdmin,
  needsBootstrap,
  unreadCount,
  messageUnreadCount,
}: Props) {
  const pathname = usePathname() ?? "";
  const navClass = (href: string, extra = "") => {
    const base = `app-nav-link${extra ? ` ${extra}` : ""}`;
    return isPathActive(pathname, href) ? `${base} is-active` : base;
  };

  return (
    <nav className="app-nav" aria-label="Primary">
      <Link href="/dashboard" className={navClass("/dashboard")}>
        Dashboard
      </Link>
      {hasPermission(role, "view_bookings") && normalizedRole !== "billing" && (
        <AppNavDropdown
          label="Scheduling"
          items={[
            { href: "/bookings", label: "Global Marketplace" },
            { href: "/schedule-cases", label: "Scheduled Cases" },
            ...(normalizedRole === "admin" ||
            normalizedRole === "facility_manager" ||
            normalizedRole === "credentialing"
              ? [{ href: "/scheduling/manage", label: "Manage" }]
              : []),
          ]}
        />
      )}
      {hasPermission(role, "view_bookings") && (
        <Link href="/calendar" className={navClass("/calendar")}>
          Calendar
        </Link>
      )}
      {hasPermission(role, "view_providers") &&
        normalizedRole !== "billing" && (
          <Link href="/providers" className={navClass("/providers")}>
            Providers
          </Link>
        )}
      {hasPermission(role, "view_billing") && (
        <AppNavDropdown
          label="Billing"
          items={[
            {
              href: "/billing/service-tracker",
              label: "Billing Service Tracker",
            },
            {
              href: "/billing/claims",
              label: "Submit Claim and History",
            },
            { href: "/billing/payments", label: "Post Payment" },
          ]}
        />
      )}
      {hasPermission(role, "view_notifications") && (
        <Link
          href="/notifications"
          className={navClass("/notifications", "app-nav-link-notifications")}
        >
          Notifications
          {unreadCount > 0 && (
            <span className="app-notification-count">{unreadCount}</span>
          )}
        </Link>
      )}
      <Link
        href="/messages"
        className={navClass("/messages", "app-nav-link-notifications")}
      >
        Conversation
        {messageUnreadCount > 0 && (
          <span className="app-notification-count">{messageUnreadCount}</span>
        )}
      </Link>
      {hasPermission(role, "view_credentials") &&
        normalizedRole !== "credentialing" && (
          <Link href="/credentials" className={navClass("/credentials")}>
            Credentials
          </Link>
        )}
      {hasPermission(role, "manage_team") && (
        <Link href="/settings/team" className={navClass("/settings/team")}>
          Team
        </Link>
      )}
      {(isGlobalAdmin || needsBootstrap) && (
        <Link href="/admin" className={navClass("/admin")}>
          Admin
        </Link>
      )}
    </nav>
  );
}
