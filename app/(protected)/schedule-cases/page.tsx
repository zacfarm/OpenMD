import { redirect } from "next/navigation";

import ScheduleCasesWorkspace from "@/components/calendar/ScheduleCasesWorkspace";
import {
  ensureDefaultScheduleCaseOptions,
  getCalendarAccessContext,
  getCalendarProviderOptions,
  getScheduleCases,
  getScheduleDocumentTypeOptions,
  getScheduleInsuranceOptions,
  getScheduleProcedureTypeOptions,
  getScheduleLocationOptions,
} from "@/lib/calendar";
import { normalizeTenantRole } from "@/lib/rbac";
import { createSupabaseServerClient } from "@/lib/supabaseServer";

function getInitialRange() {
  return {
    from: undefined,
    to: undefined,
  };
}

export default async function ScheduleCasesPage() {
  const supabase = await createSupabaseServerClient();
  const access = await getCalendarAccessContext(supabase);

  if (!access?.tenantId) {
    redirect("/login");
  }

  const normalizedRole = normalizeTenantRole(access.role);
  const canCreate =
    normalizedRole === "admin" ||
    normalizedRole === "facility_manager" ||
    normalizedRole === "credentialing" ||
    normalizedRole === "doctor";
  const canManageAll =
    normalizedRole === "admin" ||
    normalizedRole === "facility_manager" ||
    normalizedRole === "credentialing";

  if (canManageAll) {
    await ensureDefaultScheduleCaseOptions(
      supabase,
      access.tenantId,
      access.userId,
    );
  }

  const initialRange = getInitialRange();
  const [
    providers,
    locations,
    insuranceCompanies,
    procedureTypes,
    documentTypes,
    initialCases,
  ] = await Promise.all([
    getCalendarProviderOptions(supabase, access.tenantId),
    getScheduleLocationOptions(supabase, access.tenantId),
    getScheduleInsuranceOptions(supabase, access.tenantId),
    getScheduleProcedureTypeOptions(supabase, access.tenantId),
    getScheduleDocumentTypeOptions(supabase, access.tenantId),
    getScheduleCases(supabase, access, initialRange),
  ]);

  return (
    <section style={{ display: "grid", gap: 14 }}>
      <article className="card" style={{ padding: 20 }}>
        <h1 style={{ marginTop: 0 }}>Scheduled Cases</h1>
        <p style={{ color: "var(--muted)", marginBottom: 0 }}>
          Create direct cases here and track cases that also flow in from
          accepted marketplace posts.
        </p>
      </article>

      <ScheduleCasesWorkspace
        initialCases={initialCases}
        providers={providers}
        locations={locations}
        insuranceCompanies={insuranceCompanies}
        procedureTypes={procedureTypes}
        documentTypes={documentTypes}
        tenantLabel={access.tenantName ?? "Current workspace"}
        canCreate={canCreate}
        canManageAll={canManageAll}
        userProviderIds={access.providerIds}
      />
    </section>
  );
}
