# Email Invite Configuration Guide

## Overview

The OpenMD application now sends team invitations directly to team members' email addresses instead of using local mailto links. This guide explains how to configure your preferred email service.

## Quick Start (Development)

By default, emails are logged to the console. To see invite emails in development:

1. Open your terminal where Next.js is running
2. When you click "Send email", you'll see the formatted email logged with all the details
3. Copy the invite URL from the logs

## Production Email Services

Choose one of the supported email providers below:

### Option 1: Resend (Recommended)

Resend is a modern, developer-friendly email service.

**Setup:**

1. Create an account at [resend.com](https://resend.com)
2. Get your API key from the Resend dashboard
3. Add to `.env.local`:

```
EMAIL_SERVICE=resend
RESEND_API_KEY=your_api_key_here
EMAIL_FROM=noreply@yourdomain.com
```

4. Install the package:

```bash
npm install resend
```

5. Uncomment the Resend code in `app/api/send-invite-email/route.ts`

### Option 2: SendGrid

SendGrid is a powerful email service with advanced features.

**Setup:**

1. Create an account at [sendgrid.com](https://sendgrid.com)
2. Get your API key from Settings > API Keys
3. Add to `.env.local`:

```
EMAIL_SERVICE=sendgrid
SENDGRID_API_KEY=your_api_key_here
EMAIL_FROM=noreply@yourdomain.com
```

4. Install the package:

```bash
npm install @sendgrid/mail
```

5. Uncomment the SendGrid code in `app/api/send-invite-email/route.ts`

### Option 3: AWS SES (Simple Email Service)

For those already using AWS infrastructure.

**Setup:**

1. Open AWS Console and navigate to SES
2. Verify your domain/email address
3. Create IAM credentials with SES permissions
4. Add to `.env.local`:

```
EMAIL_SERVICE=aws-ses
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key
AWS_SECRET_ACCESS_KEY=your_secret_key
EMAIL_FROM=noreply@yourdomain.com
```

5. Install the package:

```bash
npm install @aws-sdk/client-ses
```

6. Uncomment the AWS SES code in `app/api/send-invite-email/route.ts`

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `EMAIL_SERVICE` | No | `resend`, `sendgrid`, `aws-ses`, or omit for console logging |
| `RESEND_API_KEY` | If using Resend | Your Resend API key |
| `SENDGRID_API_KEY` | If using SendGrid | Your SendGrid API key |
| `EMAIL_FROM` | Recommended | Sender email address (default: noreply@openmd.example) |
| `AWS_REGION` | If using AWS SES | AWS region (default: us-east-1) |
| `AWS_ACCESS_KEY_ID` | If using AWS SES | AWS access key |
| `AWS_SECRET_ACCESS_KEY` | If using AWS SES | AWS secret key |

## Testing

To test the email functionality:

1. Go to Team Settings page (`/settings/team`)
2. Click "Create invite"
3. Enter a test email and role, then submit
4. Click "Send email" button on the new invite
5. Check your email inbox or server logs for the invite

## Invitation Features

✅ **Status Display**
- Pending invitations show "Status: pending"
- Accepted invitations show "✓ Accepted" badge and are disabled
- Expired invitations show "✗ Expired" and are disabled

✅ **Email Content**
- Beautiful HTML formatted email
- Secure invite token
- Direct acceptance link
- 14-day expiration notice
- Professional OpenMD branding

✅ **Security**
- Tokens are unique and cryptographically secure
- Email address validation matches sender
- Invitation expires after 14 days
- Rate limiting can be added if needed

## Adding Rate Limiting (Optional)

If you want to prevent email sending abuse, you can add rate limiting:

```typescript
// In app/api/send-invite-email/route.ts

const rateLimit = new Map<string, number[]>()

function checkRateLimit(userId: string, maxPerHour = 10): boolean {
  const now = Date.now()
  const userTimestamps = rateLimit.get(userId) || []
  const recentTimestamps = userTimestamps.filter(t => now - t < 3600000)
  
  if (recentTimestamps.length >= maxPerHour) {
    return false
  }
  
  recentTimestamps.push(now)
  rateLimit.set(userId, recentTimestamps)
  return true
}
```

## Troubleshooting

### Emails not being sent
- Check that `EMAIL_SERVICE` is set correctly
- Verify API keys are valid
- Check server logs for error messages
- Ensure sender email is verified in the email service

### Emails going to spam
- Use a branded domain for `EMAIL_FROM`
- Add SPF, DKIM, and DMARC records to your domain
- Test with email validation tools like Mail-tester

### Development issues
- In development, check the terminal where Next.js is running
- Look for "Email notification" log messages
- Copy the invite URL from logs to test

## Support

For issues with specific email providers:
- **Resend**: [Resend Docs](https://resend.com/docs)
- **SendGrid**: [SendGrid Docs](https://docs.sendgrid.com)
- **AWS SES**: [AWS SES Docs](https://docs.aws.amazon.com/ses/)
