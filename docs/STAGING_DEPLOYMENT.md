# Staging Deployment Guide

This guide configures a public staging environment for end-to-end workflow testing without impacting production.

## 1) Staging Deployment Target

Use the included `/Users/dee-annedottin/Scripts/Strategic Projects Portal/vercel.json` and deploy this repository to a dedicated staging project in Vercel (or equivalent host).

Recommended branch:
- `staging`

Recommended domain:
- `https://<your-staging-domain>`

## 2) Required Staging Environment Variables

Set these in the staging host project:

```bash
APP_ENV=staging
NEXT_PUBLIC_APP_ENV=staging

DATABASE_URL=<staging-postgres-connection-string>
NEXTAUTH_URL=<staging-public-url>
NEXTAUTH_SECRET=<secure-random-secret>

EMAIL_PROVIDER_API_KEY=<staging-or-dummy-key>
TEAMS_WEBHOOK_URL=<staging-webhook-or-blank>
STAGING_NOTIFICATION_EMAIL=staging-notifications@test.com
STAGING_TEAMS_MODE=disabled
STAGING_TEAMS_RECIPIENT=<optional-staging-teams-recipient>

AZURE_AD_CLIENT_ID=<staging-client-id>
AZURE_AD_CLIENT_SECRET=<staging-client-secret>
AZURE_AD_TENANT_ID=<staging-tenant-id>
```

Notes:
- `DATABASE_URL` must point to staging database only.
- `NEXTAUTH_URL` must be the staging public URL.
- `STAGING_TEAMS_MODE=disabled` prevents live Teams delivery in staging.
- Azure AD values are only required if/when staging SSO is enabled.

## 3) Database and Seed

Apply Prisma migrations and seed staging users:

```bash
npx prisma generate
npm run db:migrate:deploy
APP_ENV=staging npm run db:seed:staging
```

The staging seed script is:
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/prisma/seed.ts`

It upserts test users for all key personas:
- Submitter
- Business Sponsor
- Business Delegate
- Finance Sponsor
- Technology Sponsor
- Benefits Sponsor
- Project Governance User
- Finance Governance User
- SPO Committee User
- Project Manager
- PM Hub Admin
- Admin

## 4) Safe Notification Mode (Staging)

When `APP_ENV=staging`, notification behavior is safety-routed:

- In-app notifications: still enabled
- Email outbox: redirected to `STAGING_NOTIFICATION_EMAIL`
- Teams outbox: disabled by default (`STAGING_TEAMS_MODE=disabled`)
- Optional Teams redirect: set `STAGING_TEAMS_MODE=redirect` and `STAGING_TEAMS_RECIPIENT`

Implementation:
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/lib/notifications/provider.ts`

## 5) Public Test Guide and Credentials UI

Staging-only guide page:
- `/staging-guide`

Includes:
- test credentials
- workflow validation steps
- expected outcomes

Implementation:
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/app/staging-guide/page.tsx`

Login page shows staging demo accounts when `APP_ENV=staging`:
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/app/login/page.tsx`
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/components/login-form.tsx`

## 6) Test Credentials Generation

To generate randomized staging credentials file for controlled distribution:

```bash
npm run staging:credentials
```

Output:
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/exports/staging-test-credentials.json`

Default built-in staging credentials for quick test are also available at `/staging-guide`.

## 7) CI/CD (Staging)

Workflow file:
- `/Users/dee-annedottin/Scripts/Strategic Projects Portal/.github/workflows/staging-deploy.yml`

Behavior:
- Runs lint, typecheck, test, build on `staging` branch pushes
- Applies migrations + staging seed
- Deploys to Vercel preview/public staging URL using secrets

Required GitHub secrets:
- `VERCEL_TOKEN`
- `VERCEL_ORG_ID`
- `VERCEL_PROJECT_ID`
- `STAGING_DATABASE_URL`
- `STAGING_NEXTAUTH_URL`
- `STAGING_NEXTAUTH_SECRET`
- `STAGING_EMAIL_PROVIDER_API_KEY`
- `STAGING_TEAMS_WEBHOOK_URL`
- `STAGING_NOTIFICATION_EMAIL`
- `STAGING_TEAMS_MODE`
- `STAGING_TEAMS_RECIPIENT`
- `STAGING_AZURE_AD_CLIENT_ID`
- `STAGING_AZURE_AD_CLIENT_SECRET`
- `STAGING_AZURE_AD_TENANT_ID`

## 8) Azure Entra ID (If SSO Enabled)

For staging app registration:
- Add staging callback URL(s), for example:
  - `https://<staging-domain>/api/auth/callback/azure-ad`
- Add post-logout URL(s) as needed.
- Use staging-only client credentials.

## 9) Validation Checklist

After deployment, validate:
- Public staging URL is reachable.
- Login works with staging test users.
- Proposal submission and sponsor approvals work from Approvals section.
- Funding transition and sponsor/governance approvals work.
- PM assignment flow works and transitions project to Live on PM approval.
- Change Management flows operate with audit history.
- Summary PDF export works.
- In-app notifications work.
- Email/Teams are safely sandboxed in staging mode.

