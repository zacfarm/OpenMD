import { NextResponse } from 'next/server'
import { Resend } from 'resend'

import { createSupabaseServerClient } from '@/lib/supabaseServer'

export async function POST(req: Request) {
  try {
    const { inviteEmail, inviteToken, roleLabel, tenantName } = await req.json()

    if (!inviteEmail || !inviteToken || !roleLabel || !tenantName) {
      return NextResponse.json(
        { error: 'Missing required fields' },
        { status: 400 }
      )
    }

    const supabase = createSupabaseServerClient()
    const {
      data: { user },
    } = await supabase.auth.getUser()

    if (!user) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      )
    }

    const appBaseUrl = (process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000').replace(/\/$/, '')
    const inviteUrl = `${appBaseUrl}/signup?inviteToken=${encodeURIComponent(inviteToken)}`
    const subject = `OpenMD invite: ${roleLabel} - ${tenantName}`
    const htmlBody = `
      <html>
        <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #333;">
          <div style="max-width: 600px; margin: 0 auto;">
            <h2 style="color: #0c7a5a;">Welcome to OpenMD</h2>
            <p>You have been invited to join <strong>${tenantName}</strong> on OpenMD as a <strong>${roleLabel}</strong>.</p>
            
            <p style="margin: 24px 0;">
              <a href="${inviteUrl}" style="display: inline-block; padding: 12px 24px; background-color: #0c7a5a; color: white; text-decoration: none; border-radius: 6px; font-weight: bold;">
                Accept Invitation
              </a>
            </p>

            <p style="color: #666; font-size: 14px;">
              Or copy and paste this link in your browser:<br/>
              <code style="background-color: #f0f0f0; padding: 8px 12px; border-radius: 4px; display: block; margin-top: 8px; word-break: break-all;">
                ${inviteUrl}
              </code>
            </p>

            <p style="color: #999; font-size: 12px; margin-top: 24px;">
              This link will expire in 14 days. If you have any questions, contact your workspace administrator.
            </p>
          </div>
        </body>
      </html>
    `
    const textBody = `You have been invited to join ${tenantName} on OpenMD as a ${roleLabel}.\n\nUse this link to create your profile:\n${inviteUrl}\n\nThis link will expire in 14 days.`

    // Send email using configured service
    await sendEmailViaService(inviteEmail, subject, htmlBody, textBody)

    return NextResponse.json({
      success: true,
      message: 'Invite email sent successfully',
      details: {
        to: inviteEmail,
        subject,
      },
    })
  } catch (error) {
    console.error('Error sending invite email:', error)
    return NextResponse.json(
      { error: 'Failed to send invite email' },
      { status: 500 }
    )
  }
}

async function sendEmailViaService(to: string, subject: string, htmlBody: string, textBody: string) {
  const emailService = process.env.EMAIL_SERVICE || 'console'

  if (emailService === 'resend') {
    return sendViaResend(to, subject, htmlBody, textBody)
  } else if (emailService === 'sendgrid') {
    return sendViaSendGrid(to, subject, htmlBody, textBody)
  } else if (emailService === 'aws-ses') {
    return sendViaAwsSes(to, subject, htmlBody, textBody)
  } else {
    // Default: log to console for development
    console.log('📧 Email notification (configure EMAIL_SERVICE to send real emails):')
    console.log(`To: ${to}`)
    console.log(`Subject: ${subject}`)
    console.log(`\nHTML:\n${htmlBody}`)
    console.log(`\nText:\n${textBody}`)
  }
}

async function sendViaResend(to: string, subject: string, htmlBody: string, _textBody: string) {
  const resend = new Resend(process.env.RESEND_API_KEY)
  await resend.emails.send({
    from: process.env.EMAIL_FROM || 'onboarding@resend.dev',
    to,
    subject,
    html: htmlBody,
  })
}

async function sendViaSendGrid(to: string, subject: string, htmlBody: string, _textBody: string) {
  // Example: Using SendGrid (https://sendgrid.com)
  // Install: npm install @sendgrid/mail
  // Set: SENDGRID_API_KEY=your_key, EMAIL_SERVICE=sendgrid, EMAIL_FROM=noreply@yourapp.com

  // Uncomment these lines when you have SendGrid set up:
  // const sgMail = require('@sendgrid/mail')
  // sgMail.setApiKey(process.env.SENDGRID_API_KEY)
  // await sgMail.send({
  //   to,
  //   from: process.env.EMAIL_FROM || 'noreply@openmd.example',
  //   subject,
  //   html: htmlBody,
  // })

  console.log(`[SendGrid] Would send email to ${to}`)
}

async function sendViaAwsSes(to: string, subject: string, htmlBody: string, textBody: string) {
  // Example: Using AWS SES (https://aws.amazon.com/ses/)
  // Install: npm install @aws-sdk/client-ses
  // Set: EMAIL_SERVICE=aws-ses, EMAIL_FROM=verified-address@yourdomain.com
  // AWS credentials via environment or IAM role

  // Uncomment these lines when you have AWS SES set up:
  // const { SESClient, SendEmailCommand } = require('@aws-sdk/client-ses')
  // const sesClient = new SESClient({ region: process.env.AWS_REGION || 'us-east-1' })
  // await sesClient.send(new SendEmailCommand({
  //   Source: process.env.EMAIL_FROM,
  //   Destination: { ToAddresses: [to] },
  //   Message: {
  //     Subject: { Data: subject },
  //     Body: {
  //       Html: { Data: htmlBody },
  //       Text: { Data: textBody },
  //     },
  //   },
  // }))

  console.log(`[AWS SES] Would send email to ${to}`)
}

