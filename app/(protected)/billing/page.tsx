import { redirect } from "next/navigation";

export default async function BillingPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  const resolvedSearchParams = await searchParams;
  const nextParams = new URLSearchParams();

  for (const [key, value] of Object.entries(resolvedSearchParams ?? {})) {
    if (typeof value === "string" && value) {
      nextParams.set(key, value);
    }
  }

  const suffix = nextParams.toString();
  redirect("/billing/service-tracker" + (suffix ? "?" + suffix : ""));
}
