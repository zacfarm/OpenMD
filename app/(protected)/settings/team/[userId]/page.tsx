import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getRoleLabel } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

type TeamMembership = {
  id: string;
  tenant_id: string;
  user_id: string;
  role: string;
  created_at: string | null;
};

type TeamProfile = {
  email: string | null;
  full_name: string | null;
};

type ProviderProfile = {
  id: string;
  display_name: string | null;
  specialty: string | null;
  home_city: string | null;
  home_state: string | null;
  is_public: boolean;
  updated_at: string | null;
};

function formatDateTime(value: string | null) {
  if (!value) return "N/A";
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export default async function TeamMemberProfilePage({
  params,
}: {
  params: Promise<{ userId: string }>;
}) {
  const { userId } = await params;
  const supabase = await createSupabaseServerClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: viewerMembership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();

  if (!viewerMembership?.tenant_id) {
    redirect("/dashboard");
  }

  const { data: targetMembership } = await supabase
    .from("tenant_memberships")
    .select("id,tenant_id,user_id,role,created_at")
    .eq("tenant_id", viewerMembership.tenant_id)
    .eq("user_id", userId)
    .limit(1)
    .maybeSingle();

  if (!targetMembership) {
    notFound();
  }

  const typedMembership = targetMembership as TeamMembership;

  const [{ data: targetProfile }, { data: providerProfile }] =
    await Promise.all([
      supabase
        .from("profiles")
        .select("email,full_name")
        .eq("id", typedMembership.user_id)
        .maybeSingle(),
      supabase
        .from("provider_profiles")
        .select(
          "id,display_name,specialty,home_city,home_state,is_public,updated_at",
        )
        .eq("practice_tenant_id", typedMembership.tenant_id)
        .eq("user_id", typedMembership.user_id)
        .limit(1)
        .maybeSingle(),
    ]);

  const typedProfile = (targetProfile ?? null) as TeamProfile | null;
  const typedProvider = (providerProfile ?? null) as ProviderProfile | null;

  const displayName =
    typedProfile?.full_name ||
    typedProfile?.email ||
    typedProvider?.display_name ||
    typedMembership.user_id;

  const providerLocation =
    typedProvider && (typedProvider.home_city || typedProvider.home_state)
      ? `${typedProvider.home_city ?? "N/A"}, ${typedProvider.home_state ?? "N/A"}`
      : "N/A";

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <article className="card" style={{ padding: 20 }}>
        <p className="dashboard-eyebrow" style={{ marginBottom: 6 }}>
          Team
        </p>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: "clamp(1.35rem, 2.8vw, 1.85rem)",
          }}
        >
          Team Member Profile
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          Member information for provider, biller, scheduler, and admin roles.
        </p>
      </article>

      <article className="card" style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <div>
            <h2 style={{ margin: 0 }}>{displayName}</h2>
            <p style={{ margin: "4px 0 0", color: "var(--muted)" }}>
              {getRoleLabel(typedMembership.role)}
            </p>
          </div>
          <Link
            href="/settings/team"
            className="btn btn-secondary"
            style={{ textDecoration: "none" }}
          >
            Back to Team
          </Link>
        </div>

        <div
          style={{
            marginTop: 14,
            display: "grid",
            gap: 10,
            gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          }}
        >
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
              background: "#fbfdfc",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              Email
            </p>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
              {typedProfile?.email || "N/A"}
            </p>
          </div>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
              background: "#fbfdfc",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              Role
            </p>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
              {getRoleLabel(typedMembership.role)}
            </p>
          </div>
          <div
            style={{
              border: "1px solid var(--line)",
              borderRadius: 12,
              padding: 12,
              background: "#fbfdfc",
            }}
          >
            <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
              Joined team
            </p>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
              {formatDateTime(typedMembership.created_at)}
            </p>
          </div>
        </div>
      </article>

      {typedProvider && (
        <article className="card" style={{ padding: 18 }}>
          <h3 style={{ marginTop: 0, marginBottom: 8 }}>Provider Details</h3>
          <div
            style={{
              display: "grid",
              gap: 10,
              gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
            }}
          >
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 12,
                background: "#fbfdfc",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                Display name
              </p>
              <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                {typedProvider.display_name || "N/A"}
              </p>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 12,
                background: "#fbfdfc",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                Specialty
              </p>
              <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                {typedProvider.specialty || "N/A"}
              </p>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 12,
                background: "#fbfdfc",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                Location
              </p>
              <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                {providerLocation}
              </p>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 12,
                background: "#fbfdfc",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                Directory visibility
              </p>
              <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                {typedProvider.is_public ? "Visible" : "Hidden"}
              </p>
            </div>
            <div
              style={{
                border: "1px solid var(--line)",
                borderRadius: 12,
                padding: 12,
                background: "#fbfdfc",
              }}
            >
              <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
                Provider profile updated
              </p>
              <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
                {formatDateTime(typedProvider.updated_at)}
              </p>
            </div>
          </div>
        </article>
      )}
    </section>
  );
}
