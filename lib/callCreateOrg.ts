"use server";

import { createSupabaseServerClient } from "@/lib/supabaseServer";

export type OrgInput = {
  type: "facility" | "company";
  name: string;
  city?: string;
  state?: string;
  address_line1?: string;
  address_line2?: string;
  zip?: string;
};

export async function createOrg(input: OrgInput) {
  const supabase = await createSupabaseServerClient();
  if (!supabase) throw new Error("Supabase not configured");

  if (input.type !== "facility") {
    // existing company flow…
    throw new Error("Only facility creation handled here for now.");
  }

  const { name, address_line1, address_line2, city, state, zip } = input;

  // 1) UI pre-check (case-insensitive)
  const { data: existing, error: selErr } = await supabase
    .from("facilities")
    .select("id")
    .ilike("name", name.trim())
    .ilike("address_line1", (address_line1 ?? "").trim() || "%")
    .ilike("city", (city ?? "").trim() || "%")
    .ilike("state", (state ?? "").trim() || "%")
    .eq("zip", (zip ?? "").trim() || null);

  if (selErr) throw selErr;
  if (existing && existing.length > 0) {
    throw new Error("A facility with the same name and address already exists.");
  }

  // 2) Insert; DB unique index is the final guard
  const { data, error } = await supabase
    .from("facilities")
    .insert([{
      name: name.trim(),
      address_line1: address_line1?.trim() ?? null,
      address_line2: address_line2?.trim() ?? null,
      city: city?.trim() ?? null,
      state: state?.trim() ?? null,
      zip: zip?.trim() ?? null,
    }])
    .select("id")
    .single();

  if (error) {
    // if uniqueness index fires, present a friendly message
    if (error.code === "23505") {
      throw new Error("That facility already exists.");
    }
    throw error;
  }

  return data;
}
