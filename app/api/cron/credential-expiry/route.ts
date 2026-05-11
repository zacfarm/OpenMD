import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

/**
 * Cron endpoint for credential expiry notifications.
 * Calls notify_expiring_credentials() for 90/60/30/7-day alerts and missing docs.
 */
export async function GET() {
  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  const { data, error } = await supabase.rpc("notify_expiring_credentials");
  if (error) {
    console.error("[cron/credential-expiry]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, sent: data });
}
