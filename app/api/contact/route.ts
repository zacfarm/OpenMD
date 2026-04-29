import { NextResponse } from "next/server";
import { Resend } from "resend";

export async function POST(req: Request) {
  try {
    const { name, email, message } = await req.json();

    if (!name || !email || !message) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 },
      );
    }

    const subject = `Contact form submission from ${name}`;
    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto;">
            <h2>Contact form message</h2>
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> ${email}</p>
            <p><strong>Message:</strong></p>
            <p style="white-space: pre-wrap;">${message}</p>
          </div>
        </body>
      </html>
    `;
    const textBody = `Contact form message\n\nName: ${name}\nEmail: ${email}\n\n${message}`;

    // Send email using configured service
    // Configure recipient via the CONTACT_EMAIL_TO environment variable.
    // Example: CONTACT_EMAIL_TO=support@yourdomain.com
    const recipient = process.env.CONTACT_EMAIL_TO || "inquiryopenmd@gmail.com";
    await sendEmailViaService(recipient, subject, htmlBody, textBody);

    return NextResponse.json({ success: true, message: "Message sent" });
  } catch (error) {
    console.error("Error sending contact email:", error);
    return NextResponse.json(
      { error: "Failed to send message" },
      { status: 500 },
    );
  }
}

async function sendEmailViaService(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
) {
  const emailService = process.env.EMAIL_SERVICE || "console";

  if (emailService === "resend") {
    return sendViaResend(to, subject, htmlBody, textBody);
  } else if (emailService === "sendgrid") {
    return sendViaSendGrid(to, subject, htmlBody, textBody);
  } else if (emailService === "aws-ses") {
    return sendViaAwsSes(to, subject, htmlBody, textBody);
  } else {
    console.log(
      "📧 Contact email (configure EMAIL_SERVICE to send real emails):",
    );
    console.log(`To: ${to}`);
    console.log(`Subject: ${subject}`);
    console.log(`\nHTML:\n${htmlBody}`);
    console.log(`\nText:\n${textBody}`);
  }
}

async function sendViaResend(
  to: string,
  subject: string,
  htmlBody: string,
  _textBody: string,
) {
  const resend = new Resend(process.env.RESEND_API_KEY);
  await resend.emails.send({
    from: process.env.EMAIL_FROM || "OpenMD <onboarding@resend.dev>",
    replyTo: process.env.EMAIL_REPLY_TO || "inquiryopenmd@gmail.com",
    to,
    subject,
    html: htmlBody,
  });
}

async function sendViaSendGrid(
  to: string,
  subject: string,
  htmlBody: string,
  _textBody: string,
) {
  // See app/api/send-invite-email/route.ts for guidance on configuring SendGrid
  console.log(`[SendGrid] Would send contact email to ${to}`);
}

async function sendViaAwsSes(
  to: string,
  subject: string,
  htmlBody: string,
  textBody: string,
) {
  console.log(`[AWS SES] Would send contact email to ${to}`);
}
