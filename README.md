# OpenMD

OpenMD is a Next.js + Supabase platform for multi-tenant medical operations. It combines a public ratings directory with authenticated workspaces for scheduling, credentials, billing, messaging, and team management.

## Apps and routes

### Public

- `/` Public ratings directory with search and filters.
- `/directory/[entityType]/[slug]` Directory profiles with reviews and moderation.
- `/contact` Contact form.
- `/privacy`, `/terms`, `/hipaa` Legal and compliance pages.

### Auth

- `/login` Email/password sign-in.
- `/signup` New org onboarding or invite-based signup.
- `/forgot-password` Password reset request.
- `/reset-password` Password reset completion.

### Protected workspace

- `/dashboard` Role-aware overview.
- `/calendar` Schedule view for shifts and cases.
- `/schedule-cases` Create and manage scheduling cases.
- `/bookings` Global marketplace posts (facility requests, provider offers).
- `/providers` Provider profiles and availability.
- `/credentials` Provider compliance and credentialing review.
- `/billing/*` Billing tracker, claims, payments, patient detail.
- `/messages` In-app messaging with attachments.
- `/notifications` Notification center.
- `/settings/profile` Profile, preferences, and security audit logging.
- `/settings/team` Team invites and role management.
- `/settings/notifications` Notification preferences.

### Admin

- `/admin` Global admin review moderation and directory tag management.

### API

- `/api/contact` Contact form submission (email service integration).
- `/api/calendar/events` Read calendar events.
- `/api/schedule-events` Create and manage scheduling cases.
- Additional API routes live under `app/api/*`.

## Stack

- Next.js 14 (App Router)
- TypeScript
- Supabase Auth + Postgres + RLS

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# Optional alias if your project uses publishable key naming
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...

# Contact form delivery
EMAIL_SERVICE=console # console | resend | sendgrid | aws-ses
CONTACT_EMAIL_TO=support@yourdomain.com
EMAIL_FROM="OpenMD <onboarding@resend.dev>"
EMAIL_REPLY_TO=inquiryopenmd@gmail.com
RESEND_API_KEY=...
```

## Database setup

Apply the migrations in `supabase/migrations/` to your Supabase project.

If using Supabase CLI linked to the project:

```bash
supabase db push
```

Or run the SQL directly in Supabase SQL Editor.

## Local run

```bash
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000)

## Notes

- Public reviews are anonymous with PHI warning + validation.
- Marketplace posts are global across authenticated tenants.
- RBAC is enforced via Supabase RLS and role checks in the app.
