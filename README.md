# HRMS SaaS

Multi-tenant Human Resource Management System starter.

## Architecture
- `frontend`: Next.js App Router + TypeScript + Tailwind CSS (Vercel)
- `backend`: Express + TypeScript + Prisma (Node runtime)
- Database: MySQL
- Tenancy: tenant-scoped records; tenant context must be derived from authenticated membership, never trusted from request body.

## Initial modules
Authentication, tenant/company onboarding, RBAC, employee directory, departments, attendance, leave, payroll foundation, audit logging.

## Local development
1. Copy `backend/.env.example` to `backend/.env` and configure MySQL.
2. `cd backend && npm install && npx prisma generate && npx prisma migrate dev`
3. `npm run dev`
4. In another terminal: `cd frontend && npm install && npm run dev`
5. Set `NEXT_PUBLIC_API_URL=http://localhost:4000/api/v1` in `frontend/.env.local`.

## Security notes
- All tenant-owned queries must be scoped by `tenantId` from the verified session.
- Passwords must be hashed; access tokens must be short-lived and refresh tokens rotated/revoked.
- Add rate limiting, input validation, CSRF protections where cookie auth is used, and audit events before production.
- Payroll rules, tax, PF/ESI and statutory compliance must be configured for the client's jurisdiction and reviewed by a qualified professional.

## Deployment
Deploy frontend and backend as separate Vercel projects or deploy backend to a persistent Node host if background jobs/long-running tasks are required. Configure environment variables in the hosting dashboard; never commit secrets.
