"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useState } from "react";

import AppNavDropdown from "@/components/navigation/AppNavDropdown";
import { hasPermission, type TenantRole } from "@/lib/rbac";
import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";

type Props = {
  role: string | null;
  normalizedRole: TenantRole | null;
  isGlobalAdmin: boolean;
  needsBootstrap: boolean;
  unreadCount: number;
  messageUnreadCount: number;
  userId: string;
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
  userId,
}: Props) {
  const pathname = usePathname() ?? "";
  const [liveMessageUnreadCount, setLiveMessageUnreadCount] =
    useState(messageUnreadCount);

  useEffect(() => {
    setLiveMessageUnreadCount(messageUnreadCount);
  }, [messageUnreadCount]);

  const refreshMessageUnreadCount = useCallback(async () => {
    const supabase = createSupabaseBrowserClient();
    const { data } = await supabase.rpc("unread_message_threads_count");

    if (typeof data === "number") {
      setLiveMessageUnreadCount(data);
    }
  }, []);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    const channel = supabase
      .channel("message-unread-count")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "message_thread_messages",
        },
        () => {
          void refreshMessageUnreadCount();
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "message_conversation_participants",
          filter: `user_id=eq.${userId}`,
        },
        () => {
          void refreshMessageUnreadCount();
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [refreshMessageUnreadCount, userId]);
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
        {liveMessageUnreadCount > 0 && (
          <span className="app-notification-count">
            {liveMessageUnreadCount}
          </span>
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
