"use client";

import { useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { normalizeTenantRole } from "@/lib/rbac";
import {
  downloadCredentialDocument,
  exportCredentialDocuments,
} from "@/lib/documentExportEngine";

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

function formatDateUtc(value: string) {
  return DATE_FMT.format(new Date(value));
}

type CredentialStatus = "pending" | "approved" | "denied" | "expired";
type ComplianceStatus = "compliant" | "expiring_soon" | "missing_document";
type ExportAudience = "doctor" | "billing" | "credentialing";

const EXPORT_AUDIENCE_OPTIONS: Array<{
  value: ExportAudience;
  label: string;
}> = [
  { value: "doctor", label: "Providers" },
  { value: "billing", label: "Billers" },
  { value: "credentialing", label: "Schedulers" },
];

interface ComplianceRow {
  providerId: string;
  providerName: string;
  specialty: string | null;
  approvedActiveCount: number;
  expiringSoonCount: number;
  missingDocumentTypes: string[];
  status: ComplianceStatus;
}

interface CredentialRow {
  id: string;
  credential_type: string;
  document_name: string;
  storage_path: string;
  status: CredentialStatus;
  notes: string | null;
  expires_on: string | null;
  created_at: string;
  tenant_id: string;
  uploaded_by: string | null;
  provider_profiles: {
    id: string;
    display_name: string;
    specialty: string | null;
  } | null;
}

export default function AdminCredentialsReview({
  credentials: initial,
  tenantId,
  complianceRows,
  userRolesById,
}: {
  credentials: CredentialRow[];
  tenantId: string;
  complianceRows: ComplianceRow[];
  userRolesById: Record<string, string>;
}) {
  const supabase = createSupabaseBrowserClient();
  const [credentials, setCredentials] = useState<CredentialRow[]>(initial);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterProvider, setFilterProvider] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);
  const [toast, setToast] = useState<{
    id: string;
    msg: string;
    ok: boolean;
  } | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showExportOptions, setShowExportOptions] = useState(false);
  const [selectedAudiences, setSelectedAudiences] = useState<
    Record<ExportAudience, boolean>
  >({
    doctor: true,
    billing: true,
    credentialing: true,
  });

  // Build unique provider list for filter
  const providerMap = new Map<string, string>();
  credentials.forEach((c) => {
    if (c.provider_profiles) {
      providerMap.set(c.provider_profiles.id, c.provider_profiles.display_name);
    }
  });

  const filtered = credentials.filter((c) => {
    const matchStatus = filterStatus === "all" || c.status === filterStatus;
    const matchProvider =
      filterProvider === "all" || c.provider_profiles?.id === filterProvider;
    return matchStatus && matchProvider;
  });

  function getCredentialAudience(cred: CredentialRow): ExportAudience | null {
    if (!cred.uploaded_by) return null;
    const normalizedRole = normalizeTenantRole(userRolesById[cred.uploaded_by]);
    if (
      normalizedRole === "doctor" ||
      normalizedRole === "billing" ||
      normalizedRole === "credentialing"
    ) {
      return normalizedRole;
    }
    return null;
  }

  const audienceCounts: Record<ExportAudience, number> = {
    doctor: 0,
    billing: 0,
    credentialing: 0,
  };
  for (const credential of filtered) {
    const audience = getCredentialAudience(credential);
    if (audience) {
      audienceCounts[audience] += 1;
    }
  }

  async function handleReview(
    credId: string,
    status: CredentialStatus,
    notes: string,
  ) {
    setBusy(credId);
    setToast(null);

    const { error } = await supabase.rpc("review_credential", {
      p_credential_id: credId,
      p_status: status,
      p_notes: notes || null,
    });

    if (error) {
      setToast({ id: credId, msg: error.message, ok: false });
      setBusy(null);
      return;
    }

    setCredentials((prev) =>
      prev.map((c) =>
        c.id === credId ? { ...c, status, notes: notes || c.notes } : c,
      ),
    );
    setToast({ id: credId, msg: `Marked as ${status}`, ok: true });
    setBusy(null);
  }

  async function viewDocument(storagePath: string) {
    setFileError(null);
    const { data } = await supabase.storage
      .from("credentials")
      .createSignedUrl(storagePath, 300);
    if (data?.signedUrl) {
      window.open(data.signedUrl, "_blank", "noopener,noreferrer");
      return;
    }
    setFileError(
      "Unable to open file. Reviewer storage access may not be applied yet.",
    );
  }

  async function downloadDocument(cred: CredentialRow) {
    setFileError(null);

    try {
      await downloadCredentialDocument({
        supabase,
        document: {
          id: cred.id,
          documentName: cred.document_name,
          storagePath: cred.storage_path,
          credentialType: cred.credential_type,
          providerName: cred.provider_profiles?.display_name,
          status: cred.status,
          uploadedAt: cred.created_at,
          expiresOn: cred.expires_on,
        },
      });
    } catch (err) {
      setFileError(
        err instanceof Error
          ? err.message
          : "Unable to download this file for review.",
      );
    }
  }

  async function handleExportAll() {
    setFileError(null);
    setExporting(true);

    try {
      const selectedRoleSet = new Set<ExportAudience>(
        EXPORT_AUDIENCE_OPTIONS.filter(
          (option) => selectedAudiences[option.value],
        ).map((option) => option.value),
      );

      if (selectedRoleSet.size === 0) {
        throw new Error(
          "Select at least one user group (providers, billers, or schedulers) to export.",
        );
      }

      const exportCandidates = filtered.filter((cred) => {
        const audience = getCredentialAudience(cred);
        return audience ? selectedRoleSet.has(audience) : false;
      });

      if (exportCandidates.length === 0) {
        throw new Error(
          "No documents match the selected user group(s). Try selecting a different option.",
        );
      }

      const result = await exportCredentialDocuments({
        supabase,
        documents: exportCandidates.map((cred) => ({
          id: cred.id,
          documentName: cred.document_name,
          storagePath: cred.storage_path,
          credentialType: cred.credential_type,
          providerName: cred.provider_profiles?.display_name,
          status: cred.status,
          uploadedAt: cred.created_at,
          expiresOn: cred.expires_on,
        })),
      });

      if (result.failed.length > 0) {
        setFileError(
          `Export finished with ${result.failed.length} failed download(s). Retry for missing files.`,
        );
      } else {
        const skippedCount = filtered.length - exportCandidates.length;
        if (skippedCount > 0) {
          setFileError(
            `Exported ${result.total} document(s). Skipped ${skippedCount} document(s) outside selected user groups.`,
          );
        }
      }
    } catch (err) {
      setFileError(err instanceof Error ? err.message : "Export failed.");
    } finally {
      setExporting(false);
    }
  }

  const counts = {
    pending: credentials.filter((c) => c.status === "pending").length,
    approved: credentials.filter((c) => c.status === "approved").length,
    denied: credentials.filter((c) => c.status === "denied").length,
  };

  const complianceCounts = {
    compliant: complianceRows.filter((row) => row.status === "compliant")
      .length,
    expiringSoon: complianceRows.filter((row) => row.status === "expiring_soon")
      .length,
    missingDocument: complianceRows.filter(
      (row) => row.status === "missing_document",
    ).length,
  };

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <article className="card" style={{ padding: 18 }}>
        <h2 style={{ marginTop: 0, marginBottom: 8 }}>Compliance Dashboard</h2>
        <p style={{ marginTop: 0, color: "var(--muted)" }}>
          Tracks credential health by provider with missing-document and expiry
          risk status.
        </p>

        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 12,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              background: "#0c7a5a18",
              color: "#0c7a5a",
              border: "1px solid #0c7a5a44",
            }}
          >
            {complianceCounts.compliant} compliant
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              background: "#b4530918",
              color: "#b45309",
              border: "1px solid #b4530944",
            }}
          >
            {complianceCounts.expiringSoon} expiring soon
          </span>
          <span
            style={{
              padding: "4px 12px",
              borderRadius: 20,
              fontSize: 13,
              fontWeight: 700,
              background: "#b44a2e18",
              color: "#b44a2e",
              border: "1px solid #b44a2e44",
            }}
          >
            {complianceCounts.missingDocument} missing document
          </span>
        </div>

        {complianceRows.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No providers linked to this facility yet.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 10 }}>
            {complianceRows.map((row) => {
              const statusColor =
                row.status === "missing_document"
                  ? "#b44a2e"
                  : row.status === "expiring_soon"
                    ? "#b45309"
                    : "#0c7a5a";
              const statusLabel =
                row.status === "missing_document"
                  ? "MISSING DOCUMENT"
                  : row.status === "expiring_soon"
                    ? "EXPIRING SOON"
                    : "COMPLIANT";

              return (
                <div
                  key={row.providerId}
                  style={{
                    borderTop: "1px solid var(--line)",
                    paddingTop: 10,
                    display: "grid",
                    gap: 4,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      gap: 10,
                      alignItems: "center",
                      flexWrap: "wrap",
                    }}
                  >
                    <div>
                      <p style={{ margin: 0, fontWeight: 700 }}>
                        {row.providerName}
                      </p>
                      <p
                        style={{
                          margin: "2px 0 0",
                          color: "var(--muted)",
                          fontSize: 13,
                        }}
                      >
                        {row.specialty ?? "No specialty set"}
                      </p>
                    </div>
                    <span
                      style={{
                        padding: "3px 10px",
                        borderRadius: 20,
                        fontSize: 12,
                        fontWeight: 700,
                        background: `${statusColor}18`,
                        color: statusColor,
                        border: `1px solid ${statusColor}44`,
                      }}
                    >
                      {statusLabel}
                    </span>
                  </div>

                  <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
                    Active approved credentials: {row.approvedActiveCount} •
                    Expiring within 90 days: {row.expiringSoonCount}
                  </p>

                  {row.missingDocumentTypes.length > 0 && (
                    <p style={{ margin: 0, fontSize: 13, color: "#b44a2e" }}>
                      Missing document types:{" "}
                      {row.missingDocumentTypes.join(", ")}
                    </p>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </article>

      <article className="card" style={{ padding: 18 }}>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 10,
            flexWrap: "wrap",
          }}
        >
          <h1 style={{ marginTop: 0, marginBottom: 0 }}>Credential Review</h1>
          <button
            className="btn btn-secondary"
            onClick={() => setShowExportOptions((prev) => !prev)}
            disabled={exporting || filtered.length === 0}
          >
            {showExportOptions
              ? "Hide Export Options"
              : "Document Export Engine"}
          </button>
        </div>
        <p style={{ color: "var(--muted)", marginTop: 0 }}>
          Review and approve or deny credential documents submitted by
          providers.
        </p>

        {/* Summary counts */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 14,
            flexWrap: "wrap",
          }}
        >
          {(["pending", "approved", "denied"] as const).map((s) => (
            <span
              key={s}
              style={{
                padding: "4px 12px",
                borderRadius: 20,
                fontSize: 13,
                fontWeight: 700,
                background: STATUS_COLORS[s] + "18",
                color: STATUS_COLORS[s],
                border: `1px solid ${STATUS_COLORS[s]}44`,
              }}
            >
              {counts[s]} {s}
            </span>
          ))}
        </div>

        {/* Filters */}
        <div
          style={{
            display: "flex",
            gap: 10,
            marginBottom: 16,
            flexWrap: "wrap",
          }}
        >
          <select
            className="field"
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="all">All statuses</option>
            <option value="pending">Pending</option>
            <option value="approved">Approved</option>
            <option value="denied">Denied</option>
            <option value="expired">EXPIRED</option>
          </select>

          <select
            className="field"
            value={filterProvider}
            onChange={(e) => setFilterProvider(e.target.value)}
            style={{ width: "auto" }}
          >
            <option value="all">All providers</option>
            {Array.from(providerMap.entries()).map(([id, name]) => (
              <option key={id} value={id}>
                {name}
              </option>
            ))}
          </select>
        </div>

        {showExportOptions && (
          <div
            style={{
              marginBottom: 12,
              padding: 12,
              borderRadius: 10,
              border: "1px solid var(--line)",
              background: "#f8fafc",
              display: "grid",
              gap: 10,
            }}
          >
            <p style={{ margin: 0, fontSize: 13, color: "var(--muted)" }}>
              Choose which user documents to include in this export.
            </p>
            <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
              {EXPORT_AUDIENCE_OPTIONS.map((option) => (
                <label
                  key={option.value}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    fontSize: 13,
                    color: "var(--muted)",
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selectedAudiences[option.value]}
                    onChange={(event) =>
                      setSelectedAudiences((prev) => ({
                        ...prev,
                        [option.value]: event.target.checked,
                      }))
                    }
                  />
                  {option.label} ({audienceCounts[option.value]})
                </label>
              ))}
            </div>
            <div>
              <button
                className="btn btn-secondary"
                onClick={handleExportAll}
                disabled={exporting || filtered.length === 0}
              >
                {exporting ? "Exporting…" : "Export Selected Documents"}
              </button>
            </div>
          </div>
        )}

        {fileError && (
          <p style={{ margin: "0 0 12px", color: "var(--warning)" }}>
            {fileError}
          </p>
        )}

        {filtered.length === 0 ? (
          <p style={{ margin: 0, color: "var(--muted)" }}>
            No credentials match the current filter.
          </p>
        ) : (
          <div style={{ display: "grid", gap: 12 }}>
            {filtered.map((cred) => (
              <CredentialReviewRow
                key={cred.id}
                cred={cred}
                busy={busy === cred.id}
                toast={toast?.id === cred.id ? toast : null}
                onReview={handleReview}
                onView={viewDocument}
                onDownload={downloadDocument}
              />
            ))}
          </div>
        )}
      </article>
    </section>
  );
}

function CredentialReviewRow({
  cred,
  busy,
  toast,
  onReview,
  onView,
  onDownload,
}: {
  cred: CredentialRow;
  busy: boolean;
  toast: { msg: string; ok: boolean } | null;
  onReview: (id: string, status: CredentialStatus, notes: string) => void;
  onView: (path: string) => void;
  onDownload: (cred: CredentialRow) => Promise<void>;
}) {
  const [notes, setNotes] = useState(cred.notes ?? "");
  const [expanded, setExpanded] = useState(false);
  const [downloading, setDownloading] = useState(false);

  async function handleDownload() {
    setDownloading(true);
    try {
      await onDownload(cred);
    } finally {
      setDownloading(false);
    }
  }

  return (
    <div
      style={{
        borderTop: "1px solid var(--line)",
        paddingTop: 12,
      }}
    >
      {/* Provider badge */}
      <p
        style={{
          margin: "0 0 6px",
          fontSize: 12,
          fontWeight: 700,
          textTransform: "uppercase",
          color: "var(--muted)",
          letterSpacing: "0.05em",
        }}
      >
        {cred.provider_profiles?.display_name ?? "Unknown provider"}
        {cred.provider_profiles?.specialty
          ? ` — ${cred.provider_profiles.specialty}`
          : ""}
      </p>

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
          <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--muted)" }}>
            Uploaded {formatDateUtc(cred.created_at)}
          </p>
        </div>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 8,
            flexWrap: "wrap",
          }}
        >
          <span
            style={{
              padding: "3px 10px",
              borderRadius: 20,
              fontSize: 12,
              fontWeight: 700,
              background: STATUS_COLORS[cred.status] + "18",
              color: STATUS_COLORS[cred.status],
              border: `1px solid ${STATUS_COLORS[cred.status]}44`,
            }}
          >
            {cred.status.toUpperCase()}
          </span>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => onView(cred.storage_path)}
          >
            VIEW DOC
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={handleDownload}
            disabled={downloading}
          >
            {downloading ? "DOWNLOADING..." : "DOWNLOAD FILE"}
          </button>
          <button
            className="btn btn-secondary"
            style={{ fontSize: 12, padding: "4px 10px" }}
            onClick={() => setExpanded((o) => !o)}
          >
            {expanded ? "COLLAPSE" : "REVIEW"}
          </button>
        </div>
      </div>

      {expanded && (
        <div
          style={{
            marginTop: 10,
            padding: 12,
            background: "#f9fafb",
            borderRadius: 10,
            display: "grid",
            gap: 8,
          }}
        >
          <label style={{ display: "grid", gap: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600 }}>
              Review notes (optional)
            </span>
            <textarea
              className="field"
              rows={2}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Reason for approval or denial…"
            />
          </label>
          <div style={{ display: "flex", gap: 8 }}>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => onReview(cred.id, "approved", notes)}
              style={{ background: "#0c7a5a" }}
            >
              {busy ? "Saving…" : "✓ Approve"}
            </button>
            <button
              className="btn btn-primary"
              disabled={busy}
              onClick={() => onReview(cred.id, "denied", notes)}
              style={{ background: "#b44a2e" }}
            >
              {busy ? "Saving…" : "✗ Deny"}
            </button>
            <button
              className="btn btn-secondary"
              disabled={busy}
              onClick={() => onReview(cred.id, "expired", notes)}
            >
              MARK EXPIRED
            </button>
          </div>
          {toast && (
            <p
              style={{
                margin: 0,
                fontSize: 13,
                color: toast.ok ? "var(--accent)" : "var(--warning)",
              }}
            >
              {toast.msg}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
