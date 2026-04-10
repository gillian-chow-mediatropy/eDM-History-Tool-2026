# eDM Marriott Email Tools (2026)

Web platform for Marriott campaign workflow: archive browsing, template/source admin, campaign workspace (builder/proof/versions), and role-based operations.

## Tech Stack

- Frontend: React + Vite (`frontend/`)
- Backend: Express API (`api/`)
- Database: PostgreSQL + Prisma (`prisma/`)
- Auth: session cookie + role/permission guards
- Email proof provider: Resend (via `send-proof` route)

## Project Status

- Baseline migration to React + Express + Prisma is complete.
- Admin master data modules are live (Templates, Source Campaigns, Areas, Markets).
- Campaign workspace and Step 1/Step 2 builder flow are implemented.
- Template listing now supports `Template + Language` rows with working-link prioritization.
- Remaining major work is workflow completion for Step 3 to Step 6.

Detailed tracking is in `project.md` and `api/data/progress.json`.

## Prerequisites

- Node.js 20 or 22 (`.nvmrc` is `22`)
- Docker Desktop

## Local Setup

1. Use Node version from `.nvmrc`
```bash
nvm use
```
2. Install dependencies
```bash
npm install
```
3. Create local environment file
```bash
cp .env.example .env
```
4. Start PostgreSQL container
```bash
npm run db:up
```
5. Initialize database schema
```bash
npx prisma db push
```
6. Start app (API + frontend)
```bash
npm run dev
```

## URLs

- Frontend: `http://localhost:5173`
- API: `http://localhost:3001`
- PostgreSQL: `localhost:5433`

Project database uses `5433` intentionally to avoid local `5432` conflicts.

## Useful Commands

- Start full app: `npm run dev`
- Start API only: `npm run dev:api`
- Start frontend only: `npm run dev:web`
- Build frontend: `npm run build:web`
- Start production API: `npm start`
- Start DB container: `npm run db:up`
- Stop DB container: `npm run db:down`
- Prisma generate: `npm run prisma:generate`
- Prisma migrate (dev): `npm run prisma:migrate`
- Prisma deploy migrations: `npm run prisma:deploy`
- Prisma Studio: `npm run prisma:studio`
- Legacy stack (reference only): `npm run dev:legacy`

## Environment Variables

See `.env.example` for defaults and full keys.

Core variables:
- `DATABASE_URL`
- `SMARTSHEET_API_TOKEN`
- `SMARTSHEET_SHEET_ID`
- `PROOF_EMAIL_PROVIDER`
- `RESEND_API_KEY`
- `PROOF_FROM_EMAIL`
- `PASSWORD_RESET_FROM_EMAIL`
- `PASSWORD_RESET_TOKEN_MINUTES`
- `ADMIN_EMAIL`
- `ADMIN_PASSWORD`
- `ADMIN_NAME`
- `FRONTEND_URL`
- `API_PORT`

## Auth and Permissions

Roles:
- `ADMIN`
- `EDITOR`
- `VIEWER`
- `APPROVER`

Permission keys used in app:
- `builder:view`
- `builder:edit`
- `proof:send`
- `settings:view`
- `settings:manage_users`

## Main Modules

- `Archive`: search/filter deployed campaigns with preview handling.
- `Campaigns`: create/manage campaign workspaces.
- `Builder`: template-bound draft editor, QA checks, versions, proof send.
- `Templates`: fixed Template 1-6 management and archive HTML import.
- `Source Campaigns`: source catalog and preview link management.
- `Areas` and `Markets`: master data for campaign mapping.
- `Users`: admin user and role management.

## Notes

- Frontend build may show chunk-size warning from Vite; currently non-blocking.
- Legacy Netlify/vanilla implementation is still present for reference.
