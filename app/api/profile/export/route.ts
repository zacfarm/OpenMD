import JSZip from "jszip";
import { NextResponse } from "next/server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

type CsvCell = string | number | boolean | null | undefined;

function escapeCsvValue(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return `"${value.replace(/"/g, '""')}"`;
  }
  return value;
}

function toCsvCell(value: CsvCell): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  return String(value);
}

function buildCsv(headers: string[], rows: CsvCell[][]): string {
  const allRows = [headers, ...rows];
  return allRows
    .map((row) => row.map((cell) => escapeCsvValue(toCsvCell(cell))).join(","))
    .join("\n");
}

export async function GET() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const exportedAt = new Date().toISOString();

  const [
    profileRes,
    providerRes,
    settingsRes,
    membershipsRes,
    prefsRes,
    auditRes,
  ] = await Promise.all([
    supabase
      .from("profiles")
      .select("id,email,full_name,created_at")
      .eq("id", user.id)
      .maybeSingle(),
    supabase
      .from("provider_profiles")
      .select(
        "id,display_name,specialty,home_city,home_state,is_public,created_at",
      )
      .eq("user_id", user.id),
    supabase
      .from("user_profile_settings")
      .select(
        "timezone,preferred_contact,digest_frequency,public_profile_visible,show_location,internal_only_contact,created_at,updated_at",
      )
      .eq("user_id", user.id)
      .maybeSingle(),
    supabase
      .from("tenant_memberships")
      .select("tenant_id,role,created_at")
      .eq("user_id", user.id),
    supabase
      .from("notification_preferences")
      .select("channel,event_type,enabled")
      .eq("user_id", user.id),
    supabase
      .from("user_security_audit_logs")
      .select("action,created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(100),
  ]);

  const profile = profileRes.data;
  const providerProfiles = providerRes.data ?? [];
  const profileSettings = settingsRes.data;
  const memberships = membershipsRes.data ?? [];
  const notificationPreferences = prefsRes.data ?? [];
  const securityAuditLogs = auditRes.data ?? [];

  const zip = new JSZip();

  const summary = {
    exportedAt,
    userId: user.id,
    scope: "minimal-security-safe-export",
    includedFiles: [
      "profile.csv",
      "provider-profiles.csv",
      "profile-settings.csv",
      "memberships.csv",
      "notification-preferences.csv",
      "security-audit-summary.csv",
    ],
    excludedSensitiveData: [
      "password hashes",
      "session tokens",
      "security audit metadata payloads",
      "internal auth provider details",
      "raw storage paths",
    ],
  };

  zip.file(
    "README.txt",
    [
      "OpenMD Account Export",
      "",
      "This export intentionally includes a minimal, security-conscious dataset.",
      "Sensitive internal fields are excluded to reduce account abuse risk.",
      "",
      `Exported at: ${exportedAt}`,
      `User ID: ${user.id}`,
    ].join("\n"),
  );
  zip.file("summary.json", JSON.stringify(summary, null, 2));

  zip.file(
    "profile.csv",
    buildCsv(
      ["id", "email", "full_name", "created_at"],
      profile
        ? [[profile.id, profile.email, profile.full_name, profile.created_at]]
        : [],
    ),
  );

  zip.file(
    "provider-profiles.csv",
    buildCsv(
      [
        "id",
        "display_name",
        "specialty",
        "home_city",
        "home_state",
        "is_public",
        "created_at",
      ],
      providerProfiles.map((row) => [
        row.id,
        row.display_name,
        row.specialty,
        row.home_city,
        row.home_state,
        row.is_public,
        row.created_at,
      ]),
    ),
  );

  zip.file(
    "profile-settings.csv",
    buildCsv(
      [
        "timezone",
        "preferred_contact",
        "digest_frequency",
        "public_profile_visible",
        "show_location",
        "internal_only_contact",
        "created_at",
        "updated_at",
      ],
      profileSettings
        ? [
            [
              profileSettings.timezone,
              profileSettings.preferred_contact,
              profileSettings.digest_frequency,
              profileSettings.public_profile_visible,
              profileSettings.show_location,
              profileSettings.internal_only_contact,
              profileSettings.created_at,
              profileSettings.updated_at,
            ],
          ]
        : [],
    ),
  );

  zip.file(
    "memberships.csv",
    buildCsv(
      ["tenant_id", "role", "created_at"],
      memberships.map((row) => [row.tenant_id, row.role, row.created_at]),
    ),
  );

  zip.file(
    "notification-preferences.csv",
    buildCsv(
      ["channel", "event_type", "enabled"],
      notificationPreferences.map((row) => [
        row.channel,
        row.event_type,
        row.enabled,
      ]),
    ),
  );

  zip.file(
    "security-audit-summary.csv",
    buildCsv(
      ["action", "created_at"],
      securityAuditLogs.map((row) => [row.action, row.created_at]),
    ),
  );

  const zipBuffer = await zip.generateAsync({ type: "arraybuffer" });

  return new NextResponse(zipBuffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename=\"openmd-account-export-${user.id}.zip\"`,
      "Cache-Control": "no-store",
    },
  });
}
