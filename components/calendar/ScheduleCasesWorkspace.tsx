"use client";

import { useEffect, useState } from "react";
import { format } from "date-fns";
import Link from "next/link";

import { createSupabaseBrowserClient } from "@/lib/supabaseClient";
import { getCalendarBillingHref } from "@/lib/calendar";
import {
  DEFAULT_SCHEDULE_DOCUMENT_TYPES,
  SCHEDULE_DOCUMENT_ACCEPT,
  SCHEDULE_DOCUMENT_MAX_BYTES,
} from "@/lib/scheduling";
import type {
  CalendarProviderOption,
  ScheduleCaseDTO,
  ScheduleDocumentTypeOption,
  ScheduleInsuranceOption,
  ScheduleProcedureTypeOption,
  ScheduleLocationOption,
} from "@/types/calendar";

type Props = {
  initialCases: ScheduleCaseDTO[];
  providers: CalendarProviderOption[];
  locations: ScheduleLocationOption[];
  insuranceCompanies: ScheduleInsuranceOption[];
  procedureTypes: ScheduleProcedureTypeOption[];
  documentTypes: ScheduleDocumentTypeOption[];
  tenantLabel: string;
  canCreate: boolean;
  canManageAll: boolean;
  userProviderIds: string[];
};

type ScheduleCaseNote = {
  id: string;
  note_body: string;
  created_by_name: string;
  created_at: string;
};

type ScheduleCaseDocument = {
  id: string;
  document_type: string;
  document_name: string;
  storage_path: string;
  mime_type: string | null;
  file_size_bytes: number | null;
  uploaded_by_name: string;
  created_at: string;
};

type CaseFormState = {
  patientFirstName: string;
  patientLastName: string;
  patientAddressLine1: string;
  patientCity: string;
  patientState: string;
  patientZip: string;
  patientSex: "male" | "female" | "";
  visitType: "inpatient" | "outpatient" | "";
  title: string;
  providerId: string;
  serviceDate: string;
  startTime: string;
  endTime: string;
  locationId: string;
  insuranceCompanyId: string;
  procedureTypeId: string;
  notes: string;
  status: string;
};

const emptyForm: CaseFormState = {
  patientFirstName: "",
  patientLastName: "",
  patientAddressLine1: "",
  patientCity: "",
  patientState: "",
  patientZip: "",
  patientSex: "",
  visitType: "",
  title: "",
  providerId: "",
  serviceDate: "",
  startTime: "",
  endTime: "",
  locationId: "",
  insuranceCompanyId: "",
  procedureTypeId: "",
  notes: "",
  status: "scheduled",
};

function toFormState(item: ScheduleCaseDTO): CaseFormState {
  const start = new Date(item.start);
  const end = new Date(item.end);

  return {
    patientFirstName: item.patientFirstName || "",
    patientLastName: item.patientLastName || "",
    patientAddressLine1: item.patientAddressLine1 || "",
    patientCity: item.patientCity || "",
    patientState: item.patientState || "",
    patientZip: item.patientZip || "",
    patientSex: item.patientSex || "",
    visitType: item.visitType || "",
    title: item.title || "",
    providerId: item.provider?.id || "",
    serviceDate: format(start, "yyyy-MM-dd"),
    startTime: format(start, "HH:mm"),
    endTime: format(end, "HH:mm"),
    locationId: item.locationOption?.id || "",
    insuranceCompanyId: item.insuranceCompany?.id || "",
    procedureTypeId: item.procedureType?.id || "",
    notes: item.notes || "",
    status: item.status,
  };
}

export default function ScheduleCasesWorkspace({
  initialCases,
  providers,
  locations,
  insuranceCompanies,
  procedureTypes,
  documentTypes,
  tenantLabel,
  canCreate,
  canManageAll,
  userProviderIds,
}: Props) {
  const supabase = createSupabaseBrowserClient();
  const [cases, setCases] = useState(initialCases);
  const [providerId, setProviderId] = useState("");
  const [status, setStatus] = useState("");
  const [memberFilter, setMemberFilter] = useState("");
  const [windowMode, setWindowMode] = useState<"all" | "today" | "month">(
    "all",
  );
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingCase, setEditingCase] = useState<ScheduleCaseDTO | null>(null);
  const [form, setForm] = useState<CaseFormState>(emptyForm);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [notesCase, setNotesCase] = useState<ScheduleCaseDTO | null>(null);
  const [notes, setNotes] = useState<ScheduleCaseNote[]>([]);
  const [noteBody, setNoteBody] = useState("");
  const [notesLoading, setNotesLoading] = useState(false);
  const [notesError, setNotesError] = useState("");
  const [documentsCase, setDocumentsCase] = useState<ScheduleCaseDTO | null>(
    null,
  );
  const [documents, setDocuments] = useState<ScheduleCaseDocument[]>([]);
  const [documentsLoading, setDocumentsLoading] = useState(false);
  const [documentsError, setDocumentsError] = useState("");
  const [documentType, setDocumentType] = useState("");
  const [documentFile, setDocumentFile] = useState<File | null>(null);
  const [documentName, setDocumentName] = useState("");
  const [billingStatusByClaimId, setBillingStatusByClaimId] = useState<
    Record<string, string>
  >({});

  useEffect(() => {
    const controller = new AbortController();
    const now = new Date();
    const start =
      windowMode === "all"
        ? null
        : windowMode === "today"
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
          : new Date(now.getFullYear(), now.getMonth(), 1);
    const end =
      windowMode === "all"
        ? null
        : windowMode === "today"
          ? new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              23,
              59,
              59,
              999,
            )
          : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);

    const params = new URLSearchParams();

    if (start && end) {
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    }

    if (providerId) params.set("providerId", providerId);
    if (status) params.set("status", status);

    async function loadCases() {
      setLoading(true);
      setError("");
      try {
        const response = await fetch(
          `/api/schedule-events?${params.toString()}`,
          {
            signal: controller.signal,
            cache: "no-store",
          },
        );
        const payload = (await response.json()) as {
          cases?: ScheduleCaseDTO[];
          error?: string;
        };
        if (!response.ok) {
          setError(payload.error || "Unable to load cases.");
          return;
        }
        setCases(payload.cases ?? []);
      } catch (err) {
        if (err instanceof DOMException && err.name === "AbortError") return;
        setError("Unable to load cases.");
      } finally {
        setLoading(false);
      }
    }

    void loadCases();
    return () => controller.abort();
  }, [providerId, status, windowMode]);

  useEffect(() => {
    let active = true;

    async function loadBillingStatuses() {
      const claimIds = Array.from(
        new Set(
          cases
            .map((item) => item.billingClaimId)
            .filter((value): value is string => Boolean(value)),
        ),
      );

      if (claimIds.length === 0) {
        setBillingStatusByClaimId({});
        return;
      }

      const { data, error: claimStatusError } = await supabase
        .from("insurance_claims")
        .select("id,status")
        .in("id", claimIds);

      if (!active || claimStatusError) {
        return;
      }

      const nextStatusMap = (data ?? []).reduce<Record<string, string>>(
        (acc, row) => {
          acc[row.id] = row.status;
          return acc;
        },
        {},
      );

      setBillingStatusByClaimId(nextStatusMap);
    }

    void loadBillingStatuses();

    return () => {
      active = false;
    };
  }, [cases, supabase]);

  function openCreateModal() {
    setEditingCase(null);
    setForm(emptyForm);
    setIsModalOpen(true);
  }

  function openEditModal(item: ScheduleCaseDTO) {
    setEditingCase(item);
    setForm(toFormState(item));
    setIsModalOpen(true);
  }

  async function refreshCases() {
    const now = new Date();
    const start =
      windowMode === "all"
        ? null
        : windowMode === "today"
          ? new Date(now.getFullYear(), now.getMonth(), now.getDate())
          : new Date(now.getFullYear(), now.getMonth(), 1);
    const end =
      windowMode === "all"
        ? null
        : windowMode === "today"
          ? new Date(
              now.getFullYear(),
              now.getMonth(),
              now.getDate(),
              23,
              59,
              59,
              999,
            )
          : new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59, 999);
    const params = new URLSearchParams();
    if (start && end) {
      params.set("from", start.toISOString());
      params.set("to", end.toISOString());
    }
    if (providerId) params.set("providerId", providerId);
    if (status) params.set("status", status);
    const response = await fetch(`/api/schedule-events?${params.toString()}`, {
      cache: "no-store",
    });
    const payload = (await response.json()) as {
      cases?: ScheduleCaseDTO[];
      error?: string;
    };
    if (!response.ok) {
      setError(payload.error || "Unable to refresh cases.");
      return;
    }
    setCases(payload.cases ?? []);
  }

  async function submitForm(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");

    const response = await fetch(
      editingCase
        ? `/api/schedule-events/${editingCase.id}`
        : "/api/schedule-events",
      {
        method: editingCase ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(form),
      },
    );

    let payload: { error?: string } = {};
    try {
      payload = (await response.json()) as { error?: string };
    } catch {
      payload = {
        error: "The server returned an invalid response while saving the case.",
      };
    }

    if (!response.ok) {
      setError(payload.error || "Unable to save case.");
      return;
    }

    setIsModalOpen(false);
    setEditingCase(null);
    setForm(emptyForm);
    await refreshCases();
  }

  async function deleteCase(id: string) {
    const confirmed = window.confirm("Delete this scheduled case?");
    if (!confirmed) return;

    const response = await fetch(`/api/schedule-events/${id}`, {
      method: "DELETE",
    });
    let payload: { error?: string } = {};
    try {
      payload = (await response.json()) as { error?: string };
    } catch {
      payload = {
        error:
          "The server returned an invalid response while deleting the case.",
      };
    }
    if (!response.ok) {
      setError(payload.error || "Unable to delete case.");
      return;
    }

    await refreshCases();
  }

  async function openNotesModal(item: ScheduleCaseDTO) {
    setNotesCase(item);
    setNotes([]);
    setNotesError("");
    setNoteBody("");
    setNotesLoading(true);

    const { data, error: notesFetchError } = await supabase
      .from("schedule_event_notes")
      .select("id,note_body,created_by_name,created_at")
      .eq("schedule_event_id", item.id)
      .order("created_at", { ascending: false });

    if (notesFetchError) {
      setNotesError(notesFetchError.message);
      setNotesLoading(false);
      return;
    }

    setNotes((data ?? []) as ScheduleCaseNote[]);
    setNotesLoading(false);
  }

  async function addNote(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!notesCase) return;

    const trimmed = noteBody.trim();
    if (!trimmed) {
      setNotesError("Enter a note before saving.");
      return;
    }

    setNotesError("");
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setNotesError("You must be signed in to add a note.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const authorName =
      profile?.full_name?.trim() || user.email || "OpenMD User";

    const { data, error: insertError } = await supabase
      .from("schedule_event_notes")
      .insert({
        schedule_event_id: notesCase.id,
        tenant_id: notesCase.tenantId,
        note_body: trimmed,
        created_by: user.id,
        created_by_name: authorName,
      })
      .select("id,note_body,created_by_name,created_at")
      .single();

    if (insertError || !data) {
      setNotesError(insertError?.message || "Unable to save note.");
      return;
    }

    setNotes((current) => [data as ScheduleCaseNote, ...current]);
    setNoteBody("");
  }

  async function openDocumentsModal(item: ScheduleCaseDTO) {
    setDocumentsCase(item);
    setDocuments([]);
    setDocumentsError("");
    setDocumentType("");
    setDocumentFile(null);
    setDocumentName("");
    setDocumentsLoading(true);

    const { data, error: documentsFetchError } = await supabase
      .from("schedule_event_documents")
      .select(
        "id,document_type,document_name,storage_path,mime_type,file_size_bytes,uploaded_by_name,created_at",
      )
      .eq("schedule_event_id", item.id)
      .order("created_at", { ascending: false });

    if (documentsFetchError) {
      setDocumentsError(documentsFetchError.message);
      setDocumentsLoading(false);
      return;
    }

    setDocuments((data ?? []) as ScheduleCaseDocument[]);
    setDocumentsLoading(false);
  }

  async function uploadDocument(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!documentsCase) return;

    if (!documentType) {
      setDocumentsError("Select a document type.");
      return;
    }

    if (!documentFile) {
      setDocumentsError("Choose a file to upload.");
      return;
    }

    if (documentFile.size > SCHEDULE_DOCUMENT_MAX_BYTES) {
      setDocumentsError("File must be smaller than 10 MB.");
      return;
    }

    setDocumentsError("");

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      setDocumentsError("You must be signed in to upload a document.");
      return;
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("full_name")
      .eq("id", user.id)
      .maybeSingle();

    const authorName =
      profile?.full_name?.trim() || user.email || "OpenMD User";
    const safeFileName = documentFile.name.replace(/[^a-z0-9._-]/gi, "_");
    const storagePath = `${documentsCase.tenantId}/${documentsCase.id}/${Date.now()}_${safeFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("schedule-case-documents")
      .upload(storagePath, documentFile);

    if (uploadError) {
      setDocumentsError(uploadError.message);
      return;
    }

    const rowName = documentName.trim() || documentFile.name;
    const { data, error: insertError } = await supabase
      .from("schedule_event_documents")
      .insert({
        schedule_event_id: documentsCase.id,
        tenant_id: documentsCase.tenantId,
        document_type: documentType,
        document_name: rowName,
        storage_path: storagePath,
        mime_type: documentFile.type || null,
        file_size_bytes: documentFile.size,
        uploaded_by: user.id,
        uploaded_by_name: authorName,
      })
      .select(
        "id,document_type,document_name,storage_path,mime_type,file_size_bytes,uploaded_by_name,created_at",
      )
      .single();

    if (insertError || !data) {
      setDocumentsError(
        insertError?.message || "Unable to save document record.",
      );
      return;
    }

    setDocuments((current) => [data as ScheduleCaseDocument, ...current]);
    setDocumentType("");
    setDocumentName("");
    setDocumentFile(null);
    const form = event.currentTarget;
    form.reset();
  }

  async function viewDocument(document: ScheduleCaseDocument) {
    const { data, error: signedUrlError } = await supabase.storage
      .from("schedule-case-documents")
      .createSignedUrl(document.storage_path, 60 * 60);

    if (signedUrlError || !data?.signedUrl) {
      setDocumentsError(signedUrlError?.message || "Unable to open document.");
      return;
    }

    window.open(data.signedUrl, "_blank", "noopener,noreferrer");
  }

  async function deleteDocument(document: ScheduleCaseDocument) {
    const confirmed = window.confirm(`Delete "${document.document_name}"?`);
    if (!confirmed) return;

    const { error: storageDeleteError } = await supabase.storage
      .from("schedule-case-documents")
      .remove([document.storage_path]);

    if (storageDeleteError) {
      setDocumentsError(storageDeleteError.message);
      return;
    }

    const { error: rowDeleteError } = await supabase
      .from("schedule_event_documents")
      .delete()
      .eq("id", document.id);

    if (rowDeleteError) {
      setDocumentsError(rowDeleteError.message);
      return;
    }

    setDocuments((current) =>
      current.filter((item) => item.id !== document.id),
    );
  }

  function getCasePatientName(item: ScheduleCaseDTO) {
    return (
      [item.patientFirstName, item.patientLastName].filter(Boolean).join(" ") ||
      item.patientDisplayName ||
      item.title
    );
  }

  function getBillingStatusLabel(item: ScheduleCaseDTO) {
    if (item.billingClaimId) {
      return billingStatusByClaimId[item.billingClaimId] ?? "linked";
    }

    if (item.status === "completed") {
      return "ready_for_billing";
    }

    return "not_started";
  }

  const completedMemberOptions = Array.from(
    new Set(
      cases
        .filter((item) => item.status === "completed")
        .map((item) => getCasePatientName(item)),
    ),
  ).sort((a, b) => a.localeCompare(b));

  const visibleCases = memberFilter
    ? cases.filter(
        (item) =>
          item.status === "completed" &&
          getCasePatientName(item) === memberFilter,
      )
    : cases;

  const finishedServicesCount = cases.filter(
    (item) => item.status === "completed",
  ).length;
  const readyForBillingCount = cases.filter(
    (item) => item.status === "completed" && !item.billingClaimId,
  ).length;
  const missingScheduleConfig =
    locations.length === 0 ||
    insuranceCompanies.length === 0 ||
    procedureTypes.length === 0;

  const documentTypeOptions = [
    ...DEFAULT_SCHEDULE_DOCUMENT_TYPES,
    ...documentTypes.map((item) => item.label),
  ];

  return (
    <article className="card" style={{ padding: 18 }}>
      <div className="section-head">
        <div>
          <h2 style={{ margin: 0 }}>Scheduled Cases</h2>
          <p className="section-subtitle">
            Manage direct scheduled cases and marketplace-accepted cases for{" "}
            {tenantLabel} in one list.
          </p>
        </div>
        {canCreate ? (
          <button
            className="btn btn-primary"
            type="button"
            onClick={openCreateModal}
          >
            Create Case
          </button>
        ) : (
          <Link href="/bookings" className="btn btn-secondary">
            Create Marketplace Post
          </Link>
        )}
      </div>

      <div className="calendar-filters">
        <label className="calendar-filter">
          Window
          <select
            className="field"
            value={windowMode}
            onChange={(event) =>
              setWindowMode(event.target.value as "all" | "today" | "month")
            }
          >
            <option value="all">All time</option>
            <option value="today">Today</option>
            <option value="month">This month</option>
          </select>
        </label>

        <label className="calendar-filter">
          Provider
          <select
            className="field"
            value={providerId}
            onChange={(event) => setProviderId(event.target.value)}
          >
            <option value="">All providers</option>
            {providers.map((provider) => (
              <option key={provider.id} value={provider.id}>
                {provider.label}
              </option>
            ))}
          </select>
        </label>

        <label className="calendar-filter">
          Status
          <select
            className="field"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="">All statuses</option>
            <option value="scheduled">Scheduled</option>
            <option value="confirmed">Confirmed</option>
            <option value="in_progress">In progress</option>
            <option value="completed">Completed</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </label>

        <label className="calendar-filter">
          Member
          <select
            className="field"
            value={memberFilter}
            onChange={(event) => setMemberFilter(event.target.value)}
          >
            <option value="">All members</option>
            {completedMemberOptions.map((member) => (
              <option key={member} value={member}>
                {member}
              </option>
            ))}
          </select>
        </label>
      </div>

      <p className="section-subtitle" style={{ margin: "6px 0 0" }}>
        Finished services: {finishedServicesCount} · Ready for billing:{" "}
        {readyForBillingCount}
      </p>

      {error && (
        <p style={{ color: "var(--warning)", margin: "8px 0" }}>{error}</p>
      )}
      {loading && (
        <p style={{ color: "var(--muted)", margin: "8px 0" }}>
          Refreshing cases…
        </p>
      )}

      <div className="dashboard-case-table" style={{ marginTop: 16 }}>
        <div className="dashboard-case-head">
          <span>Patient</span>
          <span>Status</span>
          <span>Provider</span>
          <span>When</span>
          <span>Coverage</span>
          <span>Actions</span>
        </div>

        {visibleCases.length === 0 ? (
          <div className="dashboard-case-empty">
            {memberFilter
              ? "No finished services for the selected member in this view."
              : "No scheduled cases in this view."}
          </div>
        ) : (
          visibleCases.map((item) => {
            const canManageItem =
              canManageAll ||
              (item.providerId
                ? userProviderIds.includes(item.providerId)
                : false);
            const billingStatus = getBillingStatusLabel(item);

            return (
              <article
                id={`case-${item.id}`}
                className="dashboard-case-row scheduled-case-row"
                key={item.id}
              >
                <div className="dashboard-case-primary">
                  <strong>{getCasePatientName(item)}</strong>
                  <span>{item.caseIdentifier || "No case id"}</span>
                  <span>
                    {[
                      item.patientAddressLine1,
                      item.patientCity,
                      item.patientState,
                      item.patientZip,
                    ]
                      .filter(Boolean)
                      .join(", ")}
                  </span>
                  <p>
                    {item.patientSex
                      ? item.patientSex.charAt(0).toUpperCase() +
                        item.patientSex.slice(1)
                      : "Sex not set"}{" "}
                    ·{" "}
                    {item.visitType
                      ? item.visitType.charAt(0).toUpperCase() +
                        item.visitType.slice(1)
                      : "Visit type not set"}
                  </p>
                </div>

                <div>
                  <span
                    className={`dashboard-case-status dashboard-case-status-${item.status.replace(/_/g, "-")}`}
                  >
                    {item.status.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="dashboard-case-meta">
                  <strong>{item.provider?.name ?? "Unassigned"}</strong>
                  {item.provider?.specialty && (
                    <span>{item.provider.specialty}</span>
                  )}
                </div>

                <div className="dashboard-case-meta">
                  <strong>{new Date(item.start).toLocaleDateString()}</strong>
                  <span>
                    {format(new Date(item.start), "p")} -{" "}
                    {format(new Date(item.end), "p")}
                  </span>
                </div>

                <div className="dashboard-case-meta">
                  <strong>
                    {item.locationOption?.name || item.location || tenantLabel}
                  </strong>
                  <span>
                    {item.insuranceCompany?.name || "No insurance selected"}
                  </span>
                  <span>
                    {item.sourceLabel} ·{" "}
                    {item.procedureType?.name ||
                      item.caseType ||
                      "Procedure not set"}
                  </span>
                  <span>
                    Billing status: {billingStatus.replace(/_/g, " ")}
                  </span>
                </div>

                <div className="dashboard-case-actions">
                  <Link
                    className="btn btn-secondary"
                    href={getCalendarBillingHref(item)}
                  >
                    Billing
                  </Link>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => openNotesModal(item)}
                  >
                    Notes
                  </button>
                  <button
                    className="btn btn-secondary"
                    type="button"
                    onClick={() => openDocumentsModal(item)}
                  >
                    Documents
                  </button>
                  {canManageItem && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => openEditModal(item)}
                    >
                      Edit
                    </button>
                  )}
                  {canManageItem && (
                    <button
                      className="btn btn-secondary"
                      type="button"
                      onClick={() => deleteCase(item.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
              </article>
            );
          })
        )}
      </div>

      {isModalOpen && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => setIsModalOpen(false)}
          role="presentation"
        >
          <div
            className="calendar-modal card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="section-head">
              <div>
                <h3 style={{ margin: 0 }}>
                  {editingCase
                    ? "Edit Scheduled Case"
                    : "Create Scheduled Case"}
                </h3>
                <p className="section-subtitle">
                  {tenantLabel} will be assigned automatically as the
                  organization.
                </p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setIsModalOpen(false)}
              >
                Close
              </button>
            </div>

            {editingCase && !canManageAll && (
              <p className="section-subtitle" style={{ marginTop: -6 }}>
                Provider edits are limited to status, notes, and time for your
                own scheduled cases.
              </p>
            )}

            <form onSubmit={submitForm} className="calendar-modal-form">
              <label>
                Patient First Name
                <input
                  className="field"
                  value={form.patientFirstName}
                  onChange={(event) =>
                    setForm({ ...form, patientFirstName: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label>
                Patient Last Name
                <input
                  className="field"
                  value={form.patientLastName}
                  onChange={(event) =>
                    setForm({ ...form, patientLastName: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Patient Address
                <input
                  className="field"
                  value={form.patientAddressLine1}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      patientAddressLine1: event.target.value,
                    })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label>
                City
                <input
                  className="field"
                  value={form.patientCity}
                  onChange={(event) =>
                    setForm({ ...form, patientCity: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label>
                State
                <input
                  className="field"
                  value={form.patientState}
                  onChange={(event) =>
                    setForm({ ...form, patientState: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label>
                Zip
                <input
                  className="field"
                  value={form.patientZip}
                  onChange={(event) =>
                    setForm({ ...form, patientZip: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label>
                Sex
                <select
                  className="field"
                  value={form.patientSex}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      patientSex: event.target.value as "male" | "female" | "",
                    })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                >
                  <option value="">Select sex</option>
                  <option value="male">Male</option>
                  <option value="female">Female</option>
                </select>
              </label>
              <label>
                Visit Type
                <select
                  className="field"
                  value={form.visitType}
                  onChange={(event) =>
                    setForm({
                      ...form,
                      visitType: event.target.value as
                        | "inpatient"
                        | "outpatient"
                        | "",
                    })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                >
                  <option value="">Select visit type</option>
                  <option value="inpatient">Inpatient</option>
                  <option value="outpatient">Outpatient</option>
                </select>
              </label>
              <label>
                Provider
                <select
                  className="field"
                  value={form.providerId}
                  onChange={(event) =>
                    setForm({ ...form, providerId: event.target.value })
                  }
                  disabled={Boolean(editingCase && !canManageAll)}
                >
                  <option value="">
                    Leave unassigned / fill from marketplace claim
                  </option>
                  {providers.map((provider) => (
                    <option key={provider.id} value={provider.id}>
                      {provider.label}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Case title
                <input
                  className="field"
                  value={form.title}
                  onChange={(event) =>
                    setForm({ ...form, title: event.target.value })
                  }
                  placeholder="Optional internal title"
                  disabled={Boolean(editingCase && !canManageAll)}
                />
              </label>
              <label>
                Date of Service
                <input
                  className="field"
                  type="date"
                  value={form.serviceDate}
                  onChange={(event) =>
                    setForm({ ...form, serviceDate: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Status
                <select
                  className="field"
                  value={form.status}
                  onChange={(event) =>
                    setForm({ ...form, status: event.target.value })
                  }
                >
                  <option value="scheduled">Scheduled</option>
                  <option value="confirmed">Confirmed</option>
                  <option value="in_progress">In progress</option>
                  <option value="completed">Completed</option>
                  <option value="cancelled">Cancelled</option>
                </select>
              </label>
              <label>
                Start Time
                <input
                  className="field"
                  type="time"
                  value={form.startTime}
                  onChange={(event) =>
                    setForm({ ...form, startTime: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                End Time
                <input
                  className="field"
                  type="time"
                  value={form.endTime}
                  onChange={(event) =>
                    setForm({ ...form, endTime: event.target.value })
                  }
                  required
                />
              </label>
              <label>
                Location
                <select
                  className="field"
                  value={form.locationId}
                  onChange={(event) =>
                    setForm({ ...form, locationId: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                >
                  <option value="">
                    {locations.length
                      ? "Select location"
                      : "No locations configured"}
                  </option>
                  {locations.map((location) => (
                    <option key={location.id} value={location.id}>
                      {location.label}
                    </option>
                  ))}
                </select>
                {locations.length === 0 && (
                  <small style={{ color: "var(--warning)" }}>
                    No locations configured. Add one in{" "}
                    <Link href="/scheduling/manage">Scheduling Manage</Link>.
                  </small>
                )}
              </label>
              <label>
                Insurance Company
                <select
                  className="field"
                  value={form.insuranceCompanyId}
                  onChange={(event) =>
                    setForm({ ...form, insuranceCompanyId: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                >
                  <option value="">
                    {insuranceCompanies.length
                      ? "Select insurance company"
                      : "No insurance companies configured"}
                  </option>
                  {insuranceCompanies.map((company) => (
                    <option key={company.id} value={company.id}>
                      {company.label}
                    </option>
                  ))}
                </select>
                {insuranceCompanies.length === 0 && (
                  <small style={{ color: "var(--warning)" }}>
                    No insurance companies configured. Add one in{" "}
                    <Link href="/scheduling/manage">Scheduling Manage</Link>.
                  </small>
                )}
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Procedure Type
                <select
                  className="field"
                  value={form.procedureTypeId}
                  onChange={(event) =>
                    setForm({ ...form, procedureTypeId: event.target.value })
                  }
                  required
                  disabled={Boolean(editingCase && !canManageAll)}
                >
                  <option value="">
                    {procedureTypes.length
                      ? "Select procedure type"
                      : "No procedure types configured"}
                  </option>
                  {procedureTypes.map((procedureType) => (
                    <option key={procedureType.id} value={procedureType.id}>
                      {procedureType.label}
                    </option>
                  ))}
                </select>
                {procedureTypes.length === 0 && (
                  <small style={{ color: "var(--warning)" }}>
                    No procedure types configured. Add one in{" "}
                    <Link href="/scheduling/manage">Scheduling Manage</Link>.
                  </small>
                )}
              </label>
              <label style={{ gridColumn: "1 / -1" }}>
                Notes
                <textarea
                  className="field"
                  value={form.notes}
                  onChange={(event) =>
                    setForm({ ...form, notes: event.target.value })
                  }
                  rows={4}
                />
              </label>
              <div
                style={{
                  gridColumn: "1 / -1",
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span className="eyebrow">Organization: {tenantLabel}</span>
                <button
                  className="btn btn-primary"
                  type="submit"
                  disabled={Boolean(!editingCase && missingScheduleConfig)}
                >
                  {editingCase ? "Save changes" : "Create case"}
                </button>
              </div>
              {!editingCase && missingScheduleConfig && (
                <p
                  style={{
                    gridColumn: "1 / -1",
                    margin: 0,
                    color: "var(--warning)",
                  }}
                >
                  Configure location, insurance company, and procedure type in{" "}
                  <Link href="/scheduling/manage">Scheduling Manage</Link>{" "}
                  before creating a new case.
                </p>
              )}
            </form>
          </div>
        </div>
      )}

      {notesCase && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => setNotesCase(null)}
          role="presentation"
        >
          <div
            className="calendar-modal card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="section-head">
              <div>
                <h3 style={{ margin: 0 }}>Case Notes</h3>
                <p className="section-subtitle">
                  {[notesCase.patientFirstName, notesCase.patientLastName]
                    .filter(Boolean)
                    .join(" ") ||
                    notesCase.patientDisplayName ||
                    notesCase.title}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setNotesCase(null)}
              >
                Close
              </button>
            </div>

            <form onSubmit={addNote} style={{ display: "grid", gap: 10 }}>
              <label>
                Add note
                <textarea
                  className="field"
                  rows={4}
                  value={noteBody}
                  onChange={(event) => setNoteBody(event.target.value)}
                  placeholder="Enter a case note"
                  required
                />
              </label>
              <div style={{ display: "flex", justifyContent: "flex-end" }}>
                <button className="btn btn-primary" type="submit">
                  Save note
                </button>
              </div>
            </form>

            {notesError && (
              <p style={{ color: "var(--warning)", margin: 0 }}>{notesError}</p>
            )}
            {notesLoading ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>Loading notes…</p>
            ) : (
              <div className="schedule-history-list">
                {notes.length ? (
                  notes.map((note) => (
                    <article key={note.id} className="schedule-history-item">
                      <div className="schedule-history-head">
                        <strong>{note.created_by_name}</strong>
                        <span>
                          {new Date(note.created_at).toLocaleString()}
                        </span>
                      </div>
                      <p>{note.note_body}</p>
                    </article>
                  ))
                ) : (
                  <div className="dashboard-case-empty">No notes yet.</div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {documentsCase && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => setDocumentsCase(null)}
          role="presentation"
        >
          <div
            className="calendar-modal card"
            onClick={(event) => event.stopPropagation()}
            role="dialog"
            aria-modal="true"
          >
            <div className="section-head">
              <div>
                <h3 style={{ margin: 0 }}>Case Documents</h3>
                <p className="section-subtitle">
                  {[
                    documentsCase.patientFirstName,
                    documentsCase.patientLastName,
                  ]
                    .filter(Boolean)
                    .join(" ") ||
                    documentsCase.patientDisplayName ||
                    documentsCase.title}
                </p>
              </div>
              <button
                className="btn btn-secondary"
                type="button"
                onClick={() => setDocumentsCase(null)}
              >
                Close
              </button>
            </div>

            <form
              onSubmit={uploadDocument}
              style={{ display: "grid", gap: 10 }}
            >
              <div
                style={{
                  display: "grid",
                  gap: 10,
                  gridTemplateColumns: "1fr 1fr",
                }}
              >
                <label>
                  Document Type
                  <select
                    className="field"
                    value={documentType}
                    onChange={(event) => setDocumentType(event.target.value)}
                    required
                  >
                    <option value="">Select document type</option>
                    {documentTypeOptions.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  Document Name
                  <input
                    className="field"
                    value={documentName}
                    onChange={(event) => setDocumentName(event.target.value)}
                    placeholder="Optional display name"
                  />
                </label>
              </div>
              <label>
                File
                <input
                  className="field"
                  type="file"
                  accept={SCHEDULE_DOCUMENT_ACCEPT}
                  onChange={(event) =>
                    setDocumentFile(event.target.files?.[0] ?? null)
                  }
                  required
                />
              </label>
              <div
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  gap: 10,
                  flexWrap: "wrap",
                }}
              >
                <span className="section-subtitle" style={{ margin: 0 }}>
                  Allowed: PDF, DOC, DOCX, PNG, JPG
                </span>
                <button className="btn btn-primary" type="submit">
                  Upload document
                </button>
              </div>
            </form>

            {documentsError && (
              <p style={{ color: "var(--warning)", margin: 0 }}>
                {documentsError}
              </p>
            )}
            {documentsLoading ? (
              <p style={{ color: "var(--muted)", margin: 0 }}>
                Loading documents…
              </p>
            ) : (
              <div className="schedule-history-list">
                {documents.length ? (
                  documents.map((document) => (
                    <article
                      key={document.id}
                      className="schedule-history-item"
                    >
                      <div className="schedule-history-head">
                        <strong>{document.document_name}</strong>
                        <span>
                          {new Date(document.created_at).toLocaleString()}
                        </span>
                      </div>
                      <div className="schedule-document-meta">
                        <span>{document.document_type}</span>
                        <span>Uploaded by {document.uploaded_by_name}</span>
                        {document.file_size_bytes ? (
                          <span>
                            {Math.round(document.file_size_bytes / 1024)} KB
                          </span>
                        ) : null}
                      </div>
                      <div className="dashboard-case-actions">
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => viewDocument(document)}
                        >
                          View
                        </button>
                        <button
                          className="btn btn-secondary"
                          type="button"
                          onClick={() => deleteDocument(document)}
                        >
                          Delete
                        </button>
                      </div>
                    </article>
                  ))
                ) : (
                  <div className="dashboard-case-empty">
                    No documents uploaded yet.
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </article>
  );
}
