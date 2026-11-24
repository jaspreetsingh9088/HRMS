# PeopleFlow HRMS SaaS

A multi-tenant HR management platform. The first functional release includes company onboarding, authentication, tenant-scoped employee records, departments, attendance and leave management.

## Stack
- Frontend: Next.js App Router, React, TypeScript, Tailwind CSS
- API: Node.js, Express, TypeScript
- ORM: Prisma
- Database: PostgreSQL (Neon)
- Hosting: Vercel (frontend and API as separate projects)

## Current working modules
- Company registration and sign-in
- Tenant membership roles: OWNER, COMPANY_ADMIN, HR_MANAGER, MANAGER, EMPLOYEE
- Employee directory: create, search, update API, terminate
- Department management
- Attendance register, check-in and check-out
- Leave types, leave requests and manager approvals
- Live dashboard counts from the database

## Local setup

1. Create `backend/.env` from `backend/.env.example`.
2. Set Neon `DATABASE_URL`, `DATABASE_URL_UNPOOLED`, `JWT_ACCESS_SECRET` (at least 32 random characters), `FRONTEND_URL`.
3. Install and migrate the API:

```bash
cd backend
npm install
npx prisma generate
npx prisma migrate deploy
npm run dev
```

4. Create `frontend/.env.local` from `frontend/.env.example`, then set the API URL.
5. Start the frontend:

```bash
cd frontend
npm install
npm run dev
```

## Vercel environment variables

### Backend project (Root Directory: `backend`)
- `DATABASE_URL`: Neon pooled connection string (include `sslmode=require`)
- `DATABASE_URL_UNPOOLED`: Neon direct connection string (include `sslmode=require`)
- `JWT_ACCESS_SECRET`: long random secret, 32+ characters
- `FRONTEND_URL`: deployed frontend origin, e.g. `https://YOUR-FRONTEND.vercel.app`
- `NODE_ENV`: `production`

### Frontend project (Root Directory: `frontend`)
- `NEXT_PUBLIC_API_URL`: deployed API base, e.g. `https://YOUR-BACKEND.vercel.app/api/v1`

After changing environment variables, redeploy the relevant Vercel project. Vercel deployments are triggered by pushes to the connected GitHub branch.

## Security and release notes
- API tenant context is taken from a signed access token; client-supplied tenant IDs are never trusted.
- Passwords are stored as salted scrypt hashes.
- All HR records are queried using the authenticated tenant ID.
- This is an actively developed first release, not yet a complete payroll/statutory-compliance product. Before production use, add refresh-token revocation, rate limiting, audit trails, automated tests, payroll jurisdiction rules, backups and security review.
- Payroll, recruitment, performance, expense claims, advanced reporting and granular permissions are planned next modules.
