"use client";

import { useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { CREDENTIAL_TYPES } from "@/lib/credentialsPolicy";

const STATUS_COLORS: Record<string, string> = {
  pending: "#b45309",
  approved: "#0c7a5a",
  denied: "#b44a2e",
  expired: "#6b7280",
};

const DATE_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
  year: "numeric",
});

const DATETIME_FMT = new Intl.DateTimeFormat("en-US", {
  timeZone: "UTC",
  month: "short",
  day: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

function formatDateUtc(value: string) {
  return DATE_FMT.format(new Date(value));
}

function formatDateTimeUtc(value: string) {
  return DATETIME_FMT.format(new Date(value));
}

interface Credential {
  id: string;
  credential_type: string;
  document_name: string;
  storage_path: string;
  status: string;
  notes: string | null;
  expires_on: string | null;
  created_at: string;
  credential_status_history: Array<{
    id: string;
    old_status: string | null;
    new_status: string;
    notes: string | null;
    created_at: string;
  }>;
}

export default function ProviderCredentialsClient({
  initialCredentials,
  providerId,
  tenantId,
}: {
  initialCredentials: Credential[];
  providerId: string;
  tenantId: string;
}) {
  const supabase = createSupabaseBrowserClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [credentials, setCredentials] =
    useState<Credential[]>(initialCredentials);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function handleUpload(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setUploading(true);

    try {
      const form = new FormData(e.currentTarget);
      const file = form.get("file") as File;
      const credentialType = String(form.get("credentialType") || "");
      const documentName =
        String(form.get("documentName") || "").trim() || file.name;
      const expiresOn = String(form.get("expiresOn") || "").trim() || null;

      if (!file || file.size === 0) {
        setError("Please select a file.");
        setUploading(false);
        return;
      }

      if (file.size > 10 * 1024 * 1024) {
        setError("File must be smaller than 10 MB.");
        setUploading(false);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) {
        setError("Not signed in.");
        setUploading(false);
        return;
      }

      const ext = file.name.split(".").pop();
      const storagePath = `${user.id}/${Date.now()}_${documentName.replace(/[^a-z0-9._-]/gi, "_")}.${ext}`;

      const { error: uploadErr } = await supabase.storage
        .from("credentials")
        .upload(storagePath, file);

      if (uploadErr) {
        setError(uploadErr.message);
        setUploading(false);
        return;
      }

      const { data: row, error: insertErr } = await supabase
        .from("provider_credentials")
        .insert({
          provider_id: providerId,
          tenant_id: tenantId,
          uploaded_by: user.id,
          credential_type: credentialType,
          document_name: documentName,
          storage_path: storagePath,
          expires_on: expiresOn,
        })
        .select(
          "id,credential_type,document_name,storage_path,status,notes,expires_on,created_at",
        )
        .single();

      if (insertErr || !row) {
        setError(insertErr?.message ?? "Insert failed");
        setUploading(false);
        return;
      }

      setCredentials((prev) => [
        { ...row, credential_status_history: [] },
        ...prev,
      ]);
      setSuccess("Credential uploaded successfully.");
      (e.target as HTMLFormElement).reset();
      if (fileRef.current) fileRef.current.value = "";
    } catch (err) {
      setError(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {/* Upload form */}
      <article className="card" style={{ padding: 18 }}>
        <h1 style={{ marginTop: 0 }}>My Credentials</h1>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Upload your certifications and licenses. Facility admins will review
          and approve them.
        </p>

        <form onSubmit={handleUpload} style={{ display: "grid", gap: 10 }}>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}
          >
            <label>
              Credential type
              <select
                className="field"
                name="credentialType"
                required
                defaultValue=""
              >
                <option value="" disabled>
                  Select type
                </option>
                {CREDENTIAL_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Document name
              <input
                className="field"
                name="documentName"
                placeholder="e.g. DEA License 2026"
              />
            </label>
          </div>

          <div
            style={{
              display: "grid",
              gridTemplateColumns: "2fr 1fr auto",
              gap: 10,
              alignItems: "end",
            }}
          >
            <label>
              File (PDF, JPG, PNG — max 10 MB)
              <input
                ref={fileRef}
                className="field"
                type="file"
                name="file"
                accept=".pdf,.jpg,.jpeg,.png"
                required
              />
            </label>
            <label>
              Expiry date (optional)
              <input className="field" type="date" name="expiresOn" />
            </label>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={uploading}
            >
              {uploading ? "Uploading…" : "Upload"}
            </button>
          </div>

          {error && (
            <p style={{ margin: 0, color: "var(--warning)" }}>{error}</p>
          )}
          {success && (
            <p style={{ margin: 0, color: "var(--accent)" }}>{success}</p>
          )}
        </form>
      </article>

      {/* Credential list */}
      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Credential history</h2>

        {credentials.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No credentials uploaded yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {credentials.map((cred) => (
              <CredentialRow key={cred.id} cred={cred} />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function CredentialRow({ cred }: { cred: Credential }) {
  const supabase = createSupabaseBrowserClient();
  const [open, setOpen] = useState(false);
  const [signedUrl, setSignedUrl] = useState<string | null>(null);

  async function viewDocument() {
    const { data } = await supabase.storage
      .from("credentials")
      .createSignedUrl(cred.storage_path, 300);
    if (data?.signedUrl) {
      setSignedUrl(data.signedUrl);
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
    }
  }

  return (
    <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 10,
          flexWrap: "wrap",
        }}
      >
        <div>
          <p style={{ margin: 0, fontWeight: 700 }}>{cred.document_name}</p>
          <p style={{ margin: "2px 0", color: "var(--muted)", fontSize: 13 }}>
            {cred.credential_type}
            {cred.expires_on && ` • Expires ${formatDateUtc(cred.expires_on)}`}
          </p>
          <p style={{ margin: "4px 0 0", fontSize: 13, color: "var(--muted)" }}>
            Uploaded {formatDateUtc(cred.created_at)}
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              background: STATUS_COLORS[cred.status] + "22",
              color: STATUS_COLORS[cred.status],
              border: `1px solid ${STATUS_COLORS[cred.status]}44`,
            }}
          >
            {cred.status.toUpperCase()}
          </span>
          <button
            className="btn btn-secondary"
            onClick={viewDocument}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            View
          </button>
          <button
            className="btn btn-secondary"
            onClick={() => setOpen((o) => !o)}
            style={{ fontSize: 12, padding: "4px 10px" }}
          >
            {open ? "Hide history" : "History"}
          </button>
        </div>
      </div>

      {cred.notes && (
        <p
          style={{
            margin: "8px 0 0",
            fontSize: 13,
            padding: "8px 12px",
            background: "#f9fafb",
            borderRadius: 8,
          }}
        >
          <strong>Note from reviewer:</strong> {cred.notes}
        </p>
      )}

      {open && (
        <div
          style={{
            marginTop: 10,
            paddingLeft: 12,
            borderLeft: "3px solid var(--line)",
          }}
        >
          <p
            style={{
              margin: "0 0 6px",
              fontSize: 12,
              fontWeight: 700,
              color: "var(--muted)",
            }}
          >
            STATUS HISTORY
          </p>
          {cred.credential_status_history.length === 0 ? (
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              No changes yet.
            </p>
          ) : (
            cred.credential_status_history.map((h) => (
              <div
                key={h.id}
                style={{
                  display: "flex",
                  gap: 10,
                  alignItems: "baseline",
                  marginBottom: 4,
                }}
              >
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--muted)",
                    whiteSpace: "nowrap",
                  }}
                >
                  {formatDateTimeUtc(h.created_at)}
                </span>
                <span style={{ fontSize: 13 }}>
                  {h.old_status ? (
                    <>
                      <span style={{ color: STATUS_COLORS[h.old_status] }}>
                        {h.old_status}
                      </span>{" "}
                      →{" "}
                    </>
                  ) : (
                    ""
                  )}
                  <span
                    style={{
                      color: STATUS_COLORS[h.new_status],
                      fontWeight: 700,
                    }}
                  >
                    {h.new_status}
                  </span>
                  {h.notes && (
                    <span style={{ color: "var(--muted)" }}> — {h.notes}</span>
                  )}
                </span>
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
