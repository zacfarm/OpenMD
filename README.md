# OpenMD

OpenMD is a Next.js + Supabase web app focused on:

1. Public ratings directory (no login required)
2. Multi-tenant auth (practice, facility, independent doctor)
3. Provider scheduling + time-off
4. Global work marketplace workflow (facility requests + provider offers visible across all tenants)
5. In-app notification center
6. RBAC with Supabase RLS (`admin`, `scheduler`, `billing`, `provider`)

## Stack

- Next.js 14 (App Router)
- JavaScript/TypeScript
- Supabase Auth + Postgres + RLS

## Environment

Create `.env.local`:

```bash
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
# Optional alias if your project uses publishable key naming
NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=...
```

## Database setup

Apply migration in `supabase/migrations/20260227000100_openmd_initial.sql` to your new Supabase project.

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
- Work postings are global across authenticated users, not tenant-isolated.
- Email/SMS notifications are modeled as optional future extensions; MVP includes in-app notifications.
- Invite flow is token-based for MVP and enforced by tenant admin role.
