import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

type ProviderRecord = {
  id: string;
  user_id: string | null;
  display_name: string | null;
  specialty: string | null;
  home_city: string | null;
  home_state: string | null;
  is_public: boolean;
  created_at: string | null;
  updated_at: string | null;
};

type LinkedProfile = {
  email: string | null;
  full_name: string | null;
};

export default async function ProviderProfilePage({
  params,
}: {
  params: Promise<{ providerId: string }>;
}) {
  const { providerId } = await params;
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const { data: provider, error: providerError } = await supabase
    .from("provider_profiles")
    .select(
      "id,user_id,display_name,specialty,home_city,home_state,is_public,created_at,updated_at",
    )
    .eq("id", providerId)
    .maybeSingle();

  if (providerError || !provider) {
    notFound();
  }

  const typedProvider = provider as ProviderRecord;
  const { data: linkedProfile } = typedProvider.user_id
    ? await supabase
        .from("profiles")
        .select("email,full_name")
        .eq("id", typedProvider.user_id)
        .maybeSingle()
    : { data: null as LinkedProfile | null };

  const displayName =
    typedProvider.display_name ||
    linkedProfile?.full_name ||
    linkedProfile?.email ||
    typedProvider.id;

  const location =
    typedProvider.home_city || typedProvider.home_state
      ? `${typedProvider.home_city ?? "N/A"}, ${typedProvider.home_state ?? "N/A"}`
      : "N/A";

  const formatDate = (value: string | null) => {
    if (!value) return "N/A";
    return new Date(value).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <article className="card" style={{ padding: 20 }}>
        <p className="dashboard-eyebrow" style={{ marginBottom: 6 }}>
          Team
        </p>
        <h1
          style={{
            margin: "0 0 6px",
            fontSize: "clamp(1.35rem, 2.8vw, 1.8rem)",
          }}
        >
          Provider Profile
        </h1>
        <p style={{ margin: 0, color: "var(--muted)" }}>
          View detailed provider information for team collaboration and
          scheduling.
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
              {typedProvider.specialty || "No specialty listed"}
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
              Contact email
            </p>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
              {linkedProfile?.email || "N/A"}
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
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>{location}</p>
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
              Public directory profile
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
              Last updated
            </p>
            <p style={{ margin: "6px 0 0", fontWeight: 700 }}>
              {formatDate(typedProvider.updated_at)}
            </p>
          </div>
        </div>

        <div style={{ marginTop: 12, fontSize: 12, color: "var(--muted)" }}>
          <p style={{ margin: 0 }}>
            Created: {formatDate(typedProvider.created_at)}
          </p>
          <p style={{ margin: "4px 0 0" }}>Provider ID: {typedProvider.id}</p>
        </div>
      </article>
    </section>
  );
}
