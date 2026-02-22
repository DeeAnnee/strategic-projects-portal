# Strategic Projects Portal

Production-oriented web app for strategic project intake, workflow, approvals, and executive reporting.

## Stack
- Next.js (App Router) + TypeScript + Tailwind
- NextAuth for authentication and RBAC claims
- Prisma + PostgreSQL
- Azure OpenAI / OpenAI (for Project Copilot)

## Milestone A Status
Implemented:
- Role-aware credentials login (demo users)
- Auth-protected routes via middleware + server guards
- Admin-only route protection
- Left-sidebar + topbar portal shell
- Dashboard shell and `/api/me` session endpoint

## Admin Controls
- Admins can manage intake dropdown/reference lists in `/admin`.
- Admins can assign user roles and function rights in `/admin`.
- Rights are persisted in `data/users.json` and enforced on key APIs:
  - Workflow actions
  - Sponsor decisions
  - Report exports
- Reference list values are persisted in `data/reference-data.json` and are loaded dynamically by intake forms.

## Quick Start
1. Create env file:
   - `cp .env.example .env`
2. Install dependencies:
   - `npm install`
3. Generate Prisma client and apply migrations:
   - `npx prisma generate`
   - `npx prisma migrate dev`
4. Start dev server:
   - `npm run dev:clean`
5. Open [http://localhost:3000](http://localhost:3000)

If you ever see `Cannot find module './627.js'` (or similar `.next` chunk errors), run:
- `npm run clean`
- `npm run dev`

Home page is at:
- [http://localhost:3000/](http://localhost:3000/)

## Staging Deployment
- Deployment config: `/Users/dee-annedottin/Scripts/Strategic Projects Portal/vercel.json`
- Staging runbook: `/Users/dee-annedottin/Scripts/Strategic Projects Portal/docs/STAGING_DEPLOYMENT.md`
- Staging guide page (staging only): `/staging-guide`

Core staging commands:
- `npm run db:migrate:deploy`
- `APP_ENV=staging npm run db:seed:staging`
- `npm run staging:credentials`

## Demo Accounts
- `submitter@portal.local / password123`
- `reviewer@portal.local / password123`
- `approver@portal.local / password123`
- `admin@portal.local / password123`

## Checks
- `npm run lint`
- `npm run typecheck`
- `npm run test`
- `npm run build`

## Project Copilot
- Page: `/ai-helper` (also available at `/copilot`)
- Floating launcher: `STRATOS` button (bottom-right in portal)
- API routes:
  - `POST /api/copilot/chat`
  - `GET /api/copilot/history`
  - `GET /api/copilot/templates`
  - `POST /api/copilot/feedback`
  - `POST /api/copilot/artifacts`
- Features:
  - Streaming responses
  - Conversation history
  - Quick action templates
  - Structured artifacts (tasks, risks, KPIs, exec summary)
  - Feedback capture and audit logging

If no LLM credentials are set, Copilot runs in a local fallback mode so the UI and persistence still work.

## Notes
- If dependencies cannot be installed due network restrictions, code changes are still present but runtime checks cannot execute until connectivity is available.
