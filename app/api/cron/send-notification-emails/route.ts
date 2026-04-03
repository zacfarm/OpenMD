import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

/**
 * GET /api/cron/send-notification-emails
 *
 * Queries notifications created in the past hour for users who opted into
 * email delivery (notification_preferences.email = true). Sends one digest
 * email per user.
 */
export async function GET(req: Request) {
  // Optional debug override: /api/cron/send-notification-emails?minutes=1440
  const requestUrl = new URL(req.url);
  const overrideMinutes = Number(requestUrl.searchParams.get("minutes") || "");
  const lookbackMinutes =
    Number.isFinite(overrideMinutes) && overrideMinutes > 0
      ? overrideMinutes
      : 60;

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const warnings = getEmailConfigWarnings();

  const since = new Date(
    Date.now() - lookbackMinutes * 60 * 1000,
  ).toISOString();
  const { data: rows, error } = await supabase.rpc(
    "get_pending_email_notifications",
    {
      since_time: since,
    },
  );

  if (error) {
    console.error("[cron/send-notification-emails]", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  if (!rows || rows.length === 0) {
    return NextResponse.json({
      ok: true,
      sent: 0,
      scanned: 0,
      lookbackMinutes,
      warnings,
    });
  }

  // Group by user email so each user gets one digest
  type Row = {
    notification_id: string;
    user_email: string;
    user_name: string;
    title: string;
    body: string;
    action_url: string | null;
    notif_type: string;
  };
  const byUser: Record<string, Row[]> = {};
  for (const row of rows as Row[]) {
    if (!byUser[row.user_email]) byUser[row.user_email] = [];
    byUser[row.user_email].push(row);
  }

  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || "http://localhost:3000"
  ).replace(/\/$/, "");
  let sentCount = 0;
  const failed: Array<{ email: string; reason: string }> = [];

  for (const [email, items] of Object.entries(byUser)) {
    const userName = items[0].user_name ?? email;
    const subject =
      items.length === 1
        ? `OpenMD: ${items[0].title}`
        : `OpenMD: ${items.length} new notifications`;

    const itemsHtml = items
      .map(
        (n) => `
        <tr>
          <td style="padding: 10px 0; border-bottom: 1px solid #eee;">
            <strong style="color: #111;">${escapeHtml(n.title)}</strong><br/>
            <span style="color: #555; font-size: 14px;">${escapeHtml(n.body)}</span>
            ${
              n.action_url
                ? `<br/><a href="${appUrl}${n.action_url}" style="font-size:13px; color:#0c7a5a;">View →</a>`
                : ""
            }
          </td>
        </tr>`,
      )
      .join("");

    const html = `
      <html><body style="font-family: Arial, sans-serif; color: #333; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #0c7a5a;">Hi ${escapeHtml(userName)},</h2>
        <p>You have ${items.length} new notification${items.length > 1 ? "s" : ""} on OpenMD:</p>
        <table style="width:100%; border-collapse:collapse;">${itemsHtml}</table>
        <p style="margin-top:24px;">
          <a href="${appUrl}/notifications"
             style="display:inline-block; padding:10px 20px; background:#0c7a5a; color:#fff;
                    text-decoration:none; border-radius:6px;">
            View all notifications
          </a>
        </p>
        <p style="color:#999; font-size:12px; margin-top:24px;">
          Manage your notification preferences at
          <a href="${appUrl}/settings/notifications" style="color:#999;">${appUrl}/settings/notifications</a>.
        </p>
      </body></html>`;

    const text = items.map((n) => `• ${n.title}: ${n.body}`).join("\n");

    try {
      await sendEmail(email, subject, html, text);
      sentCount++;
    } catch (err) {
      console.error(
        `[cron/send-notification-emails] failed to send to ${email}:`,
        err,
      );
      const reason =
        err instanceof Error ? err.message : "Unknown email delivery error";
      failed.push({ email, reason });
    }
  }

  return NextResponse.json({
    ok: true,
    sent: sentCount,
    failed: failed.length,
    failedRecipients: failed,
    scanned: rows.length,
    recipients: Object.keys(byUser).length,
    lookbackMinutes,
    warnings,
  });
}

function getEmailConfigWarnings(): string[] {
  const warnings: string[] = [];
  const service = (process.env.EMAIL_SERVICE ?? "console").toLowerCase();
  const emailFrom = process.env.EMAIL_FROM;

  if (service === "console") {
    warnings.push(
      "EMAIL_SERVICE is set to console; emails are logged but not delivered.",
    );
  }

  if (service === "resend") {
    if (!process.env.RESEND_API_KEY) {
      warnings.push("RESEND_API_KEY is missing; Resend delivery will fail.");
    }
    if (!emailFrom) {
      warnings.push(
        "EMAIL_FROM is not set; default sender onboarding@resend.dev may be restricted to test recipients.",
      );
    } else if (emailFrom.endsWith("@resend.dev")) {
      warnings.push(
        "EMAIL_FROM uses resend.dev testing sender. Use a verified domain sender for external recipients.",
      );
    }
  }

  return warnings;
}

function escapeHtml(str: string) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

async function sendEmail(
  to: string,
  subject: string,
  html: string,
  text: string,
) {
  const service = process.env.EMAIL_SERVICE ?? "console";

  if (service === "resend") {
    if (!process.env.RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY is not configured");
    }

    const emailFrom = process.env.EMAIL_FROM || "onboarding@resend.dev";
    const resend = new Resend(process.env.RESEND_API_KEY);
    const result = await resend.emails.send({
      from: emailFrom,
      to,
      subject,
      html,
    });
    if (result.error) {
      throw new Error(`[Resend] ${result.error.message}`);
    }
  } else {
    console.log(
      `[notification-email] To: ${to} | Subject: ${subject}\n${text}`,
    );
  }
}
