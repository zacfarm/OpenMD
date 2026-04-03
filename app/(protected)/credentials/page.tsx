import { redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabaseServer";
import { REQUIRED_CREDENTIAL_TYPES } from "@/lib/credentialsPolicy";
import { hasPermission, normalizeTenantRole } from "@/lib/rbac";
import ProviderCredentialsClient from "@/app/(protected)/credentials/ProviderCredentialsClient";
import AdminCredentialsReview from "@/app/(protected)/credentials/AdminCredentialsReview";

type ComplianceStatus = "compliant" | "expiring_soon" | "missing_document";

type ComplianceRow = {
  providerId: string;
  providerName: string;
  specialty: string | null;
  approvedActiveCount: number;
  expiringSoonCount: number;
  missingDocumentTypes: string[];
  status: ComplianceStatus;
};

type ProviderProfileRef = {
  id: string;
  display_name: string;
  specialty: string | null;
};

function asProviderProfile(
  value: ProviderProfileRef | ProviderProfileRef[] | null | undefined,
): ProviderProfileRef | null {
  if (!value) return null;
  return Array.isArray(value) ? (value[0] ?? null) : value;
}

export default async function CredentialsPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login");

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id,role")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!hasPermission(membership?.role, "view_credentials")) {
    redirect("/dashboard");
  }

  const role = normalizeTenantRole(membership?.role);
  const tenantId = membership!.tenant_id;

  const isReviewer = role === "admin" || role === "facility_manager";

  // Fetch the provider profile for the current user (may be null for admin-only roles)
  const { data: providerProfile } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id)
    .maybeSingle();

  // ── Provider view: own credentials ──────────────────────────────────────────
  if (!isReviewer && providerProfile) {
    const { data: credentials } = await supabase
      .from("provider_credentials")
      .select(
        "id,credential_type,document_name,storage_path,status,notes,expires_on,created_at,credential_status_history(id,old_status,new_status,notes,created_at)",
      )
      .eq("provider_id", providerProfile.id)
      .order("created_at", { ascending: false });

    return (
      <ProviderCredentialsClient
        initialCredentials={(credentials ?? []) as never}
        providerId={providerProfile.id}
        tenantId={tenantId}
      />
    );
  }

  // ── Reviewer view: all providers in tenant (facility-side admin roles only) ──
  if (isReviewer) {
    const { data: allCredentials } = await supabase
      .from("provider_credentials")
      .select(
        "id,credential_type,document_name,storage_path,status,notes,expires_on,created_at,tenant_id,provider_profiles(id,display_name,specialty)",
      )
      .eq("tenant_id", tenantId)
      .order("created_at", { ascending: false });

    const { data: providerLinks } = await supabase
      .from("provider_facility_links")
      .select("provider_id,provider_profiles(id,display_name,specialty)")
      .eq("facility_tenant_id", tenantId);

    const now = new Date();
    now.setHours(0, 0, 0, 0);

    const credentialsByProvider = new Map<
      string,
      {
        credentialType: string;
        status: string;
        expiresOn: string | null;
      }[]
    >();

    for (const credential of allCredentials ?? []) {
      const providerProfile = asProviderProfile(credential.provider_profiles);
      const providerId = providerProfile?.id;
      if (!providerId) continue;
      const existing = credentialsByProvider.get(providerId) ?? [];
      existing.push({
        credentialType: credential.credential_type,
        status: credential.status,
        expiresOn: credential.expires_on,
      });
      credentialsByProvider.set(providerId, existing);
    }

    const complianceRows: ComplianceRow[] = (providerLinks ?? []).map(
      (link) => {
        const providerId = link.provider_id;
        const providerProfile = asProviderProfile(link.provider_profiles);
        const providerName =
          providerProfile?.display_name ?? "Unknown provider";
        const providerCreds = credentialsByProvider.get(providerId) ?? [];

        const approvedActive = providerCreds.filter((cred) => {
          if (cred.status !== "approved") return false;
          if (!cred.expiresOn) return true;
          const expires = new Date(cred.expiresOn);
          expires.setHours(0, 0, 0, 0);
          return expires >= now;
        });

        const expiringSoonCount = approvedActive.filter((cred) => {
          if (!cred.expiresOn) return false;
          const expires = new Date(cred.expiresOn);
          expires.setHours(0, 0, 0, 0);
          const days = Math.floor(
            (expires.getTime() - now.getTime()) / 86400000,
          );
          return days >= 0 && days <= 90;
        }).length;

        const activeTypes = new Set(
          approvedActive.map((cred) => cred.credentialType),
        );
        const missingDocumentTypes = REQUIRED_CREDENTIAL_TYPES.filter(
          (type) => !activeTypes.has(type),
        );

        const status: ComplianceStatus =
          missingDocumentTypes.length > 0
            ? "missing_document"
            : expiringSoonCount > 0
              ? "expiring_soon"
              : "compliant";

        return {
          providerId,
          providerName,
          specialty: providerProfile?.specialty ?? null,
          approvedActiveCount: approvedActive.length,
          expiringSoonCount,
          missingDocumentTypes,
          status,
        };
      },
    );

    complianceRows.sort((a, b) => {
      const priority: Record<ComplianceStatus, number> = {
        missing_document: 0,
        expiring_soon: 1,
        compliant: 2,
      };
      const delta = priority[a.status] - priority[b.status];
      if (delta !== 0) return delta;
      return a.providerName.localeCompare(b.providerName);
    });

    // If the reviewer is also a doctor they can upload their own too
    if (providerProfile) {
      const { data: ownCredentials } = await supabase
        .from("provider_credentials")
        .select(
          "id,credential_type,document_name,storage_path,status,notes,expires_on,created_at,credential_status_history(id,old_status,new_status,notes,created_at)",
        )
        .eq("provider_id", providerProfile.id)
        .order("created_at", { ascending: false });

      return (
        <section style={{ display: "grid", gap: 14 }}>
          <AdminCredentialsReview
            credentials={(allCredentials ?? []) as never}
            tenantId={tenantId}
            complianceRows={complianceRows}
          />
          <ProviderCredentialsClient
            initialCredentials={(ownCredentials ?? []) as never}
            providerId={providerProfile.id}
            tenantId={tenantId}
          />
        </section>
      );
    }

    return (
      <AdminCredentialsReview
        credentials={(allCredentials ?? []) as never}
        tenantId={tenantId}
        complianceRows={complianceRows}
      />
    );
  }

  // Non-provider, non-review roles cannot access credentials workspace
  if (!providerProfile) {
    redirect("/dashboard");
  }

  redirect("/dashboard");
}
