"use client";

import { Fragment, useState, useCallback } from "react";

import { createSupabaseBrowserClient } from "@/lib/supabaseBrowser";
import {
  isEventTypeVisibleToRoles,
  getRoleLabel,
  type TenantRole,
} from "@/lib/notificationRoles";

const EVENT_TYPES = [
  { key: "booking_requested", label: "New booking request", group: "Bookings" },
  {
    key: "booking_status_changed",
    label: "Booking accepted / declined / canceled",
    group: "Bookings",
  },
  {
    key: "billing_claim_submitted",
    label: "Claim submitted",
    group: "Billing",
  },
  {
    key: "billing_claim_status_changed",
    label: "Claim accepted or rejected",
    group: "Billing",
  },
  {
    key: "marketplace_claimed",
    label: "Marketplace post claimed",
    group: "Marketplace",
  },
  {
    key: "credential_reviewed",
    label: "Credential approved or denied",
    group: "Credentials",
  },
  {
    key: "credential_expiring",
    label: "Credential expiring soon",
    group: "Credentials",
  },
  {
    key: "credential_missing",
    label: "Provider missing active credentials",
    group: "Credentials",
  },
  {
    key: "credential_pending_review",
    label: "New credential needs review",
    group: "Credentials",
  },
  { key: "invite_accepted", label: "Team invite accepted", group: "Team" },
  { key: "team_member_joined", label: "New team member joined", group: "Team" },
  {
    key: "message_received",
    label: "New direct message received",
    group: "Messages",
  },
] as const;

type Pref = { in_app: boolean; email: boolean };
type PrefsMap = Record<string, Pref>;
const DEFAULT_PREF: Pref = { in_app: true, email: false };
const GROUPS = [
  "Bookings",
  "Billing",
  "Marketplace",
  "Credentials",
  "Team",
  "Messages",
] as const;

export function NotificationPreferencesClient({
  initialPrefs,
  userRoles = [],
}: {
  initialPrefs: PrefsMap;
  userRoles?: TenantRole[];
}) {
  const [prefs, setPrefs] = useState<PrefsMap>(initialPrefs);
  const [saving, setSaving] = useState<string | null>(null);

  // Filter event types based on user's roles
  const visibleEventTypes = EVENT_TYPES.filter((ev) =>
    isEventTypeVisibleToRoles(ev.key, userRoles),
  );
  const visibleGroups = Array.from(
    new Set(visibleEventTypes.map((e) => e.group)),
  ) as (typeof GROUPS)[number][];

  const toggle = useCallback(
    async (eventType: string, field: "in_app" | "email") => {
      const current = prefs[eventType] ?? DEFAULT_PREF;
      const updated = { ...current, [field]: !current[field] };
      setPrefs((prev) => ({ ...prev, [eventType]: updated }));
      setSaving(eventType);
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        setSaving(null);
        return;
      }

      await supabase
        .from("notification_preferences")
        .upsert(
          { user_id: user.id, event_type: eventType, ...updated },
          { onConflict: "user_id,event_type" },
        );
      setSaving(null);
    },
    [prefs],
  );

  return (
    <section className="card" style={{ padding: 18 }}>
      <h1 style={{ marginTop: 0 }}>Notification Preferences</h1>
      <p style={{ color: "var(--muted)", marginTop: 0 }}>
        Choose which events you are notified about and by which channel. Changes
        save automatically.
      </p>

      {userRoles.length > 0 && (
        <div
          style={{
            background: "var(--surface)",
            border: "1px solid var(--line)",
            borderRadius: 4,
            padding: 12,
            marginBottom: 16,
            fontSize: 13,
          }}
        >
          <strong>Your role:</strong> {userRoles.map(getRoleLabel).join(", ")}
          <br />
          <span style={{ color: "var(--muted)", fontSize: 12 }}>
            You're seeing notification preferences relevant to your role(s).
            Contact your administrator if you need access to different
            notifications.
          </span>
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ borderBottom: "2px solid var(--line)" }}>
            <th
              style={{ textAlign: "left", padding: "8px 4px", fontWeight: 600 }}
            >
              Event
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "8px 4px",
                fontWeight: 600,
                width: 80,
              }}
            >
              In-app
            </th>
            <th
              style={{
                textAlign: "center",
                padding: "8px 4px",
                fontWeight: 600,
                width: 80,
              }}
            >
              Email
            </th>
          </tr>
        </thead>
        <tbody>
          {visibleGroups.map((group) => (
            <Fragment key={group}>
              <tr>
                <td
                  colSpan={3}
                  style={{
                    padding: "14px 4px 4px",
                    fontWeight: 700,
                    fontSize: 12,
                    color: "var(--muted)",
                    textTransform: "uppercase",
                    letterSpacing: "0.08em",
                  }}
                >
                  {group}
                </td>
              </tr>
              {visibleEventTypes
                .filter((e) => e.group === group)
                .map((ev) => {
                  const pref = prefs[ev.key] ?? DEFAULT_PREF;
                  const isSaving = saving === ev.key;
                  return (
                    <tr
                      key={ev.key}
                      style={{ borderBottom: "1px solid var(--line)" }}
                    >
                      <td style={{ padding: "10px 4px", fontSize: 14 }}>
                        {ev.label}
                      </td>
                      <td style={{ textAlign: "center", padding: "10px 4px" }}>
                        <input
                          type="checkbox"
                          checked={pref.in_app}
                          disabled={isSaving}
                          onChange={() => toggle(ev.key, "in_app")}
                          style={{
                            cursor: isSaving ? "default" : "pointer",
                            width: 16,
                            height: 16,
                          }}
                        />
                      </td>
                      <td style={{ textAlign: "center", padding: "10px 4px" }}>
                        <input
                          type="checkbox"
                          checked={pref.email}
                          disabled={isSaving}
                          onChange={() => toggle(ev.key, "email")}
                          style={{
                            cursor: isSaving ? "default" : "pointer",
                            width: 16,
                            height: 16,
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
            </Fragment>
          ))}
        </tbody>
      </table>

      <p
        style={{
          fontSize: 12,
          color: "var(--muted)",
          marginBottom: 0,
          marginTop: 16,
        }}
      >
        Email delivery requires a configured email service. Email notifications
        are sent in batches (up to once per hour).
      </p>
    </section>
  );
}
