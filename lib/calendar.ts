import { normalizeTenantRole } from "./rbac";
import type {
  CalendarAccessContext,
  CalendarEventDTO,
  CalendarEventRecord,
  CalendarFilters,
  CalendarProviderOption,
  ScheduleDocumentTypeOption,
  ScheduleInsuranceOption,
  ScheduleProcedureTypeOption,
  ScheduleLocationOption,
  ScheduleCaseDTO,
} from "@/types/calendar";

const STATUS_COLOR_MAP: Record<string, string> = {
  scheduled: "#3b82f6",
  confirmed: "#0c7a5a",
  in_progress: "#e0901c",
  completed: "#546a62",
  cancelled: "#b44a2e",
};

export function getCalendarBillingHref(
  event: Pick<CalendarEventDTO, "id" | "billingClaimId" | "source"> &
    Partial<Pick<CalendarEventDTO, "patientDisplayName">>,
) {
  if (event.source !== "schedule_event") {
    return "/billing/service-tracker";
  }

  const params = new URLSearchParams();
  params.set("eventId", event.id);

  if (event.billingClaimId) {
    params.set("claimId", event.billingClaimId);
  }

  if (event.patientDisplayName) {
    params.set("member", event.patientDisplayName);
  }

  return `/billing/service-tracker?${params.toString()}#patient-billing`;
}

export function getCalendarEventColor(
  event: Pick<CalendarEventDTO, "status" | "colorToken">,
) {
  return event.colorToken ?? STATUS_COLOR_MAP[event.status] ?? "#0c7a5a";
}

export async function getCalendarAccessContext(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
) {
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  const { data: membership } = await supabase
    .from("tenant_memberships")
    .select("tenant_id,role,tenants(name,org_type)")
    .eq("user_id", user.id)
    .limit(1)
    .maybeSingle();
  const membershipTenant = (
    Array.isArray(membership?.tenants)
      ? membership?.tenants[0]
      : membership?.tenants
  ) as {
    name: string | null;
    org_type: string | null;
  } | null;

  const normalizedRole = normalizeTenantRole(membership?.role);

  const { data: providerRows } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("user_id", user.id);

  return {
    userId: user.id,
    tenantId: membership?.tenant_id ?? null,
    tenantName: membershipTenant?.name ?? null,
    tenantOrgType: membershipTenant?.org_type ?? null,
    role: membership?.role ?? null,
    normalizedRole,
    isProviderView: normalizedRole === "doctor",
    providerIds: (providerRows ?? []).map((provider) => provider.id),
  } satisfies CalendarAccessContext;
}

export async function getCalendarProviderOptions(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  tenantId: string | null,
) {
  if (!tenantId) return [];

  const { data } = await supabase
    .from("provider_profiles")
    .select("id,display_name,specialty")
    .eq("practice_tenant_id", tenantId)
    .order("display_name", { ascending: true });

  return (
    (data ?? []) as Array<{
      id: string;
      display_name: string;
      specialty: string | null;
    }>
  ).map(
    (provider) =>
      ({
        id: provider.id,
        label: provider.display_name,
        specialty: provider.specialty,
      }) satisfies CalendarProviderOption,
  );
}

export async function ensureDefaultScheduleCaseOptions(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  tenantId: string | null,
  userId: string | null,
) {
  if (!tenantId || !userId) return;

  const [locationsRes, insuranceRes, procedureTypesRes] = await Promise.all([
    supabase
      .from("tenant_schedule_locations")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    supabase
      .from("tenant_schedule_insurance_companies")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
    supabase
      .from("tenant_schedule_procedure_types")
      .select("id", { count: "exact", head: true })
      .eq("tenant_id", tenantId)
      .eq("is_active", true),
  ]);

  if ((locationsRes.count ?? 0) === 0) {
    await supabase.from("tenant_schedule_locations").insert({
      tenant_id: tenantId,
      name: "Main Office",
      address_line_1: "123 Main St",
      city: "New York",
      state: "NY",
      zip: "10001",
      created_by: userId,
    });
  }

  if ((insuranceRes.count ?? 0) === 0) {
    await supabase.from("tenant_schedule_insurance_companies").insert({
      tenant_id: tenantId,
      name: "Medicare",
      payer_code: "MEDICARE",
      address_line_1: "7500 Security Blvd",
      city: "Baltimore",
      state: "MD",
      zip: "21244",
      network_status: "in_network",
      created_by: userId,
    });
  }

  if ((procedureTypesRes.count ?? 0) === 0) {
    await supabase.from("tenant_schedule_procedure_types").upsert(
      {
        tenant_id: tenantId,
        name: "General Consultation",
        is_active: true,
        created_by: userId,
      },
      { onConflict: "tenant_id,name" },
    );
  }
}

export async function getScheduleLocationOptions(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  tenantId: string | null,
) {
  if (!tenantId) return [];

  const { data } = await supabase
    .from("tenant_schedule_locations")
    .select("id,name,address_line_1,city,state,zip")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    (data ?? []) as Array<{
      id: string;
      name: string;
      address_line_1: string;
      city: string;
      state: string;
      zip: string;
    }>
  ).map(
    (location) =>
      ({
        id: location.id,
        label: `${location.name} · ${location.city}, ${location.state}`,
        addressLine1: location.address_line_1,
        city: location.city,
        state: location.state,
        zip: location.zip,
      }) satisfies ScheduleLocationOption,
  );
}

export async function getScheduleInsuranceOptions(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  tenantId: string | null,
) {
  if (!tenantId) return [];

  const { data } = await supabase
    .from("tenant_schedule_insurance_companies")
    .select("id,name,payer_code,address_line_1,city,state,zip,network_status")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return (
    (data ?? []) as Array<{
      id: string;
      name: string;
      payer_code: string | null;
      address_line_1: string | null;
      city: string | null;
      state: string | null;
      zip: string | null;
      network_status: "in_network" | "out_of_network" | null;
    }>
  ).map(
    (company) =>
      ({
        id: company.id,
        label: company.name,
        payerCode: company.payer_code,
        addressLine1: company.address_line_1,
        city: company.city,
        state: company.state,
        zip: company.zip,
        networkStatus: company.network_status,
      }) satisfies ScheduleInsuranceOption,
  );
}

export async function getScheduleProcedureTypeOptions(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  tenantId: string | null,
) {
  if (!tenantId) return [];

  const { data } = await supabase
    .from("tenant_schedule_procedure_types")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return ((data ?? []) as Array<{ id: string; name: string }>).map(
    (procedureType) =>
      ({
        id: procedureType.id,
        label: procedureType.name,
      }) satisfies ScheduleProcedureTypeOption,
  );
}

export async function getScheduleDocumentTypeOptions(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  tenantId: string | null,
) {
  if (!tenantId) return [];

  const { data } = await supabase
    .from("tenant_schedule_document_types")
    .select("id,name")
    .eq("tenant_id", tenantId)
    .eq("is_active", true)
    .order("name", { ascending: true });

  return ((data ?? []) as Array<{ id: string; name: string }>).map(
    (documentType) =>
      ({
        id: documentType.id,
        label: documentType.name,
      }) satisfies ScheduleDocumentTypeOption,
  );
}

export async function getCalendarEvents(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  access: CalendarAccessContext,
  filters: CalendarFilters,
) {
  if (!access.tenantId) return [];

  const { data: tenantProviderRows } = await supabase
    .from("provider_profiles")
    .select("id")
    .eq("practice_tenant_id", access.tenantId);

  const tenantProviderIds = (tenantProviderRows ?? []).map(
    (provider) => provider.id,
  );

  let scheduleQuery = supabase
    .from("schedule_events")
    .select(
      "id,tenant_id,provider_id,billing_claim_id,title,case_identifier,patient_display_name,patient_first_name,patient_last_name,patient_address_line_1,patient_city,patient_state,patient_zip,patient_sex,visit_type,case_type,status,starts_at,ends_at,location,practice_name,facility_name,notes,color_token,metadata,provider_profiles(id,display_name,specialty),tenant_schedule_locations(id,name,address_line_1,city,state,zip),tenant_schedule_insurance_companies(id,name,payer_code,address_line_1,city,state,zip,network_status),tenant_schedule_procedure_types(id,name)",
    )
    .eq("tenant_id", access.tenantId)
    .order("starts_at", { ascending: true });

  if (access.isProviderView) {
    if (!access.providerIds.length) return [];
    scheduleQuery = scheduleQuery.in("provider_id", access.providerIds);
  } else if (tenantProviderIds.length) {
    scheduleQuery = scheduleQuery.in("provider_id", tenantProviderIds);
  } else if (filters.providerId) {
    scheduleQuery = scheduleQuery.eq("provider_id", filters.providerId);
  }

  if (filters.status)
    scheduleQuery = scheduleQuery.eq("status", filters.status);
  if (filters.practice)
    scheduleQuery = scheduleQuery.ilike(
      "practice_name",
      `%${filters.practice}%`,
    );
  if (filters.facility)
    scheduleQuery = scheduleQuery.ilike(
      "facility_name",
      `%${filters.facility}%`,
    );
  if (filters.to) scheduleQuery = scheduleQuery.lte("starts_at", filters.to);
  if (filters.from) scheduleQuery = scheduleQuery.gte("ends_at", filters.from);

  let bookingQuery = supabase
    .from("booking_requests")
    .select(
      "id,requesting_tenant_id,provider_id,requested_start,requested_end,location,notes,status,provider_profiles(id,display_name,specialty)",
    )
    .in("status", ["accepted", "confirmed"])
    .order("requested_start", { ascending: true });

  if (access.isProviderView) {
    bookingQuery = bookingQuery.in("provider_id", access.providerIds);
  } else if (filters.providerId) {
    bookingQuery = bookingQuery.eq("provider_id", filters.providerId);
  } else if (tenantProviderIds.length) {
    bookingQuery = bookingQuery.or(
      [
        `requesting_tenant_id.eq.${access.tenantId}`,
        `provider_id.in.(${tenantProviderIds.join(",")})`,
      ].join(","),
    );
  } else {
    bookingQuery = bookingQuery.eq("requesting_tenant_id", access.tenantId);
  }

  if (
    filters.status &&
    (filters.status === "confirmed" || filters.status === "scheduled")
  ) {
    bookingQuery = bookingQuery.eq(
      "status",
      filters.status === "scheduled" ? "accepted" : filters.status,
    );
  } else if (filters.status) {
    bookingQuery = bookingQuery.eq("id", "__no_booking_matches__");
  }

  if (filters.to)
    bookingQuery = bookingQuery.lte("requested_start", filters.to);
  if (filters.from)
    bookingQuery = bookingQuery.gte("requested_end", filters.from);

  const [{ data: scheduleRows }, { data: bookingRows }] = await Promise.all([
    scheduleQuery,
    bookingQuery,
  ]);

  const scheduleEvents = ((scheduleRows ?? []) as CalendarEventRecord[]).map(
    (event) => {
      const provider = Array.isArray(event.provider_profiles)
        ? event.provider_profiles[0]
        : event.provider_profiles;
      const metadata = event.metadata ?? {};
      const metadataSource =
        typeof metadata.source === "string" ? metadata.source : null;

      return {
        id: event.id,
        source:
          metadataSource === "marketplace_post"
            ? "marketplace_post"
            : "schedule_event",
        title: event.title,
        start: event.starts_at,
        end: event.ends_at,
        status: event.status,
        caseType: event.case_type,
        caseIdentifier: event.case_identifier,
        patientDisplayName: event.patient_display_name,
        patientFirstName: event.patient_first_name ?? null,
        patientLastName: event.patient_last_name ?? null,
        patientAddressLine1: event.patient_address_line_1 ?? null,
        patientCity: event.patient_city ?? null,
        patientState: event.patient_state ?? null,
        patientZip: event.patient_zip ?? null,
        patientSex: (event.patient_sex as "male" | "female" | null) ?? null,
        visitType:
          (event.visit_type as "inpatient" | "outpatient" | null) ?? null,
        location: event.location,
        practiceName: event.practice_name,
        facilityName: event.facility_name,
        notes: event.notes,
        billingClaimId: event.billing_claim_id,
        insuranceCompany: (() => {
          const company = Array.isArray(
            event.tenant_schedule_insurance_companies,
          )
            ? event.tenant_schedule_insurance_companies[0]
            : event.tenant_schedule_insurance_companies;
          return company
            ? {
                id: company.id,
                name: company.name,
                payerCode: company.payer_code,
                addressLine1: company.address_line_1,
                city: company.city,
                state: company.state,
                zip: company.zip,
                networkStatus: company.network_status,
              }
            : null;
        })(),
        procedureType: (() => {
          const procedureType = Array.isArray(
            event.tenant_schedule_procedure_types,
          )
            ? event.tenant_schedule_procedure_types[0]
            : event.tenant_schedule_procedure_types;
          return procedureType
            ? {
                id: procedureType.id,
                name: procedureType.name,
              }
            : null;
        })(),
        locationOption: (() => {
          const location = Array.isArray(event.tenant_schedule_locations)
            ? event.tenant_schedule_locations[0]
            : event.tenant_schedule_locations;
          return location
            ? {
                id: location.id,
                name: location.name,
                addressLine1: location.address_line_1,
                city: location.city,
                state: location.state,
                zip: location.zip,
              }
            : null;
        })(),
        provider: provider
          ? {
              id: provider.id,
              name: provider.display_name,
              specialty: provider.specialty,
            }
          : null,
        colorToken: event.color_token,
      } satisfies CalendarEventDTO;
    },
  );

  const bookingEvents = (
    (bookingRows ?? []) as Array<{
      id: string;
      provider_id: string;
      requested_start: string;
      requested_end: string;
      location: string | null;
      notes: string | null;
      status: "accepted" | "confirmed";
      provider_profiles:
        | {
            id: string;
            display_name: string;
            specialty: string | null;
          }
        | {
            id: string;
            display_name: string;
            specialty: string | null;
          }[]
        | null;
    }>
  ).map((booking) => {
    const provider = Array.isArray(booking.provider_profiles)
      ? booking.provider_profiles[0]
      : booking.provider_profiles;
    const normalizedStatus =
      booking.status === "accepted" ? "scheduled" : "confirmed";
    const tenantLabel = access.tenantName;
    const isPractice = access.tenantOrgType === "practice";

    return {
      id: `booking-${booking.id}`,
      source: "booking_request",
      title: provider?.display_name
        ? `${provider.display_name} booking`
        : "Confirmed booking",
      start: booking.requested_start,
      end: booking.requested_end,
      status: normalizedStatus,
      caseType: "Booking",
      caseIdentifier: booking.id.slice(0, 8).toUpperCase(),
      patientDisplayName: null,
      patientFirstName: null,
      patientLastName: null,
      patientAddressLine1: null,
      patientCity: null,
      patientState: null,
      patientZip: null,
      patientSex: null,
      visitType: null,
      location: booking.location,
      practiceName: isPractice ? tenantLabel : null,
      facilityName: isPractice ? null : tenantLabel,
      notes: booking.notes,
      billingClaimId: null,
      insuranceCompany: null,
      procedureType: null,
      locationOption: null,
      provider: provider
        ? {
            id: provider.id,
            name: provider.display_name,
            specialty: provider.specialty,
          }
        : null,
      colorToken: null,
    } satisfies CalendarEventDTO;
  });

  const dedupedEvents = [...scheduleEvents, ...bookingEvents].reduce<
    CalendarEventDTO[]
  >((acc, event) => {
    const eventKey = `${event.source}:${event.caseIdentifier ?? event.id}:${event.start}:${event.end}`;
    if (
      !acc.some(
        (existing) =>
          `${existing.source}:${existing.caseIdentifier ?? existing.id}:${existing.start}:${existing.end}` ===
          eventKey,
      )
    ) {
      acc.push(event);
    }
    return acc;
  }, []);

  return dedupedEvents.sort(
    (a, b) => new Date(a.start).getTime() - new Date(b.start).getTime(),
  );
}

export async function getScheduleCases(
  supabase: Awaited<
    ReturnType<typeof import("./supabaseServer").createSupabaseServerClient>
  >,
  access: CalendarAccessContext,
  filters: CalendarFilters = {},
) {
  if (!access.tenantId) return [];

  let query = supabase
    .from("schedule_events")
    .select(
      "id,tenant_id,provider_id,billing_claim_id,title,case_identifier,patient_display_name,patient_first_name,patient_last_name,patient_address_line_1,patient_city,patient_state,patient_zip,patient_sex,visit_type,case_type,status,starts_at,ends_at,location,practice_name,facility_name,notes,color_token,metadata,provider_profiles(id,display_name,specialty),tenant_schedule_locations(id,name,address_line_1,city,state,zip),tenant_schedule_insurance_companies(id,name,payer_code,address_line_1,city,state,zip,network_status),tenant_schedule_procedure_types(id,name)",
    )
    .eq("tenant_id", access.tenantId)
    .order("starts_at", { ascending: true });

  if (access.isProviderView) {
    if (!access.providerIds.length) return [];
    query = query.in("provider_id", access.providerIds);
  } else if (filters.providerId) {
    query = query.eq("provider_id", filters.providerId);
  }

  if (filters.status) query = query.eq("status", filters.status);
  if (filters.practice)
    query = query.ilike("practice_name", `%${filters.practice}%`);
  if (filters.facility)
    query = query.ilike("facility_name", `%${filters.facility}%`);
  if (filters.to) query = query.lte("starts_at", filters.to);
  if (filters.from) query = query.gte("ends_at", filters.from);

  const { data } = await query;

  return ((data ?? []) as CalendarEventRecord[]).map((event) => {
    const provider = Array.isArray(event.provider_profiles)
      ? event.provider_profiles[0]
      : event.provider_profiles;
    const metadata = event.metadata ?? {};
    const metadataSource =
      typeof metadata.source === "string" ? metadata.source : null;

    return {
      id: event.id,
      tenantId: event.tenant_id,
      providerId: event.provider_id,
      source:
        metadataSource === "marketplace_post"
          ? "marketplace_post"
          : "schedule_event",
      sourceLabel:
        metadataSource === "marketplace_post" ? "Marketplace" : "Direct",
      title: event.title,
      start: event.starts_at,
      end: event.ends_at,
      status: event.status,
      caseType: event.case_type,
      caseIdentifier: event.case_identifier,
      patientDisplayName: event.patient_display_name,
      patientFirstName: event.patient_first_name ?? null,
      patientLastName: event.patient_last_name ?? null,
      patientAddressLine1: event.patient_address_line_1 ?? null,
      patientCity: event.patient_city ?? null,
      patientState: event.patient_state ?? null,
      patientZip: event.patient_zip ?? null,
      patientSex: (event.patient_sex as "male" | "female" | null) ?? null,
      visitType:
        (event.visit_type as "inpatient" | "outpatient" | null) ?? null,
      location: event.location,
      practiceName: event.practice_name,
      facilityName: event.facility_name,
      notes: event.notes,
      billingClaimId: event.billing_claim_id,
      insuranceCompany: (() => {
        const company = Array.isArray(event.tenant_schedule_insurance_companies)
          ? event.tenant_schedule_insurance_companies[0]
          : event.tenant_schedule_insurance_companies;
        return company
          ? {
              id: company.id,
              name: company.name,
              payerCode: company.payer_code,
              addressLine1: company.address_line_1,
              city: company.city,
              state: company.state,
              zip: company.zip,
              networkStatus: company.network_status,
            }
          : null;
      })(),
      procedureType: (() => {
        const procedureType = Array.isArray(
          event.tenant_schedule_procedure_types,
        )
          ? event.tenant_schedule_procedure_types[0]
          : event.tenant_schedule_procedure_types;
        return procedureType
          ? {
              id: procedureType.id,
              name: procedureType.name,
            }
          : null;
      })(),
      locationOption: (() => {
        const location = Array.isArray(event.tenant_schedule_locations)
          ? event.tenant_schedule_locations[0]
          : event.tenant_schedule_locations;
        return location
          ? {
              id: location.id,
              name: location.name,
              addressLine1: location.address_line_1,
              city: location.city,
              state: location.state,
              zip: location.zip,
            }
          : null;
      })(),
      provider: provider
        ? {
            id: provider.id,
            name: provider.display_name,
            specialty: provider.specialty,
          }
        : null,
      colorToken: event.color_token,
    } satisfies ScheduleCaseDTO;
  });
}
