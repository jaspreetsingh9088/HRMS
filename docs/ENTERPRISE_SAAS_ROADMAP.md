# PeopleFlow HRMS — Enterprise SaaS Product & Engineering Roadmap

**Product direction:** Commercial, multi-tenant HRMS SaaS with enterprise-grade AI assistance and workflow automation.
**Current baseline:** Next.js 15 / React 19 frontend, Express + TypeScript API, Prisma 6, PostgreSQL (Neon), Vercel deployments.
**Delivery approach:** Incremental releases behind a feature branch and pull requests. Preserve the working release; do not replace the current application in one rewrite.

## Product principles

1. **Tenant isolation first.** Every business record, background job, file, search result and AI retrieval must be scoped to an authenticated tenant. Never trust a tenant ID supplied by the browser.
2. **Human accountability.** AI can explain, draft, classify and recommend. Payroll release, hiring decisions, employee termination, leave overrides and other consequential actions require an authorized human approval.
3. **Secure by default.** Least-privilege roles, short-lived access credentials, revocation, audit events, rate limits, encryption, backups and tested recovery.
4. **Automation is observable.** Every workflow has a version, trigger, conditions, actions, run history, retry policy and failure state.
5. **Provider abstraction.** AI, email, messaging, payments and file storage are behind interfaces so the product is not locked to one vendor.
6. **Compliance is jurisdiction-aware.** Payroll and statutory rules are configured per country/state and effective date; do not ship generic calculations as legally compliant payroll.

## Target personas

- Platform operator: manages tenants, plans, billing status, platform-wide controls and support access.
- Company owner / company administrator: manages a tenant, settings, roles and subscriptions.
- HR administrator / HR manager: manages people operations and approvals.
- Manager: manages assigned team workflows and approvals.
- Employee: self-service for profile, attendance, leave, documents and payslips.
- Auditor / finance reviewer: read-only access to approved, relevant records and audit trails.

## Target architecture

- Web app: Next.js App Router, TypeScript, accessible responsive UI.
- API: Express + TypeScript, versioned REST endpoints, request validation, centralized error handling.
- Data: PostgreSQL + Prisma; tenant-aware data access patterns and indexes.
- Identity: users, tenant memberships, invitations, short-lived access tokens, rotating refresh sessions, revocation, optional MFA/SSO later.
- Authorization: tenant membership + role + permission checks on every API operation; platform roles separate from tenant roles.
- Async processing: Redis + BullMQ for scheduled work, notifications, imports, report generation and workflow execution.
- Workflow engine: event/outbox pattern, versioned workflow definitions, idempotent actions, retries, dead-letter handling and run audit.
- AI gateway: provider abstraction, structured outputs, tool allowlists, tenant-scoped retrieval, usage limits and redaction.
- Retrieval: PostgreSQL/pgvector or a separately evaluated vector store; tenant filters enforced server-side before retrieval.
- Files: private S3-compatible object storage, signed short-lived URLs, malware scanning and retention policies.
- Observability: structured logs, request correlation IDs, error monitoring, metrics and security audit events.
- Integrations: email, WhatsApp/SMS, calendar, accounting, identity providers and payment gateway through adapters.
- Deployment: keep current Vercel web/API deployment while validating background worker and Redis hosting separately.

## Product modules

### Core HR (foundation)
- Tenant onboarding, company profile, locations, legal entities and departments.
- Employee directory, employee lifecycle, job/manager relationships and secure document records.
- Invitations and employee self-service accounts.
- Role/permission matrix and tenant membership management.
- Audit log, notification center and global search.

### Workforce operations
- Attendance, shifts, rosters, holidays, overtime and configurable policies.
- Leave types, accrual/balances, requests, approvals and calendars.
- Employee onboarding/offboarding checklists and configurable workflows.

### Talent and performance
- Recruitment requisitions, careers pages, candidate pipeline and interview scheduling.
- AI-assisted resume extraction and job-to-skill matching with recruiter review; no autonomous rejection.
- Goals, review cycles, feedback, skills and learning records.

### Compensation and finance
- Compensation structures, payroll runs, payslips, deductions and reimbursements.
- Country/state-specific tax and statutory rules with effective dates and review.
- Payroll preview, maker-checker approval, immutable run snapshots and reconciliation.
- Do not enable production payroll until a jurisdiction and compliance review are complete.

### Intelligence and automation
- AI HR assistant with tenant-scoped, permission-filtered answers and source citations.
- Natural-language analytics with approved metrics and query allowlists.
- Resume/document extraction, policy Q&A, summaries and draft communications.
- Visual workflow builder with triggers, conditions, actions, schedules, approvals and execution history.
- Predictive insights only as explainable decision support, with human review and bias monitoring.

### Commercial SaaS
- Public plans, trial lifecycle, tenant subscription state and entitlements.
- Billing provider adapter, invoices, payment status, usage metering and plan upgrades.
- Platform admin console, tenant support tools, service status and tenant-level feature flags.
- Data export, tenant deletion workflow, retention controls and support access audit.

## Phased delivery

### Phase 0 — Baseline and engineering controls
- Preserve the current production deployment.
- Add feature branch / PR workflow, CI build and type checks, API tests and migration checks.
- Document current API contracts, tenant boundaries, secrets and deployment configuration.
- Establish environment separation and safe test tenant/database.

### Phase 1 — Enterprise SaaS foundation
- Multi-tenant membership and tenant switching.
- Invitations and account lifecycle.
- Refresh-session rotation, logout/revocation and password reset.
- Central authorization and tenant-scoped repository/service patterns.
- Audit events, rate limits, validation, security headers and structured errors.
- Tenant settings, company locations and platform administration foundations.

### Phase 2 — HR operations
- Complete employee lifecycle and document management.
- Attendance policies, shifts, holiday calendars and leave accrual.
- Notifications and onboarding/offboarding workflows.
- Permission-aware reporting and exports.

### Phase 3 — Automation platform
- Queue/worker infrastructure, event outbox and scheduler.
- Workflow definitions, versioning, approvals, retries, idempotency and run history.
- Email/in-app notifications first; messaging integrations after consent and provider setup.

### Phase 4 — Enterprise AI
- AI gateway, model/provider configuration, budgets and usage telemetry.
- Tenant-scoped retrieval and permissions-aware assistant.
- Resume/document extraction and HR summaries.
- Tool calling limited to approved read actions initially; write actions require explicit confirmation and policy checks.
- Evaluation dataset, prompt-injection defenses, sensitive-data redaction and audit logging.

### Phase 5 — Commercialization
- Plans, entitlements, trials, billing, invoices and usage metering.
- Platform admin console and tenant lifecycle operations.
- SSO/MFA, advanced audit exports, retention and disaster recovery.
- Jurisdiction-specific payroll only after legal/accounting validation.

## Initial release acceptance criteria

- Automated tests prove that tenant A cannot read or mutate tenant B records, including by guessing IDs.
- Users can belong to multiple tenants and explicitly select an active workspace.
- Revoked/expired sessions cannot access APIs.
- Every privileged mutation records actor, tenant, action, target, timestamp and request correlation ID.
- Workflow retries do not duplicate side effects.
- AI retrieval and tools enforce the same tenant and permission checks as normal API endpoints.
- AI cannot execute high-impact HR actions without an explicit authorized approval.
- CI runs type checks, tests and production builds before merge.
- Database backups and restore procedure are tested before general availability.

## Immediate engineering sequence

1. Add CI and test scaffolding without changing the current production branch.
2. Design and migrate membership/session/audit schema with backward-compatible rollout.
3. Implement tenant selection and session lifecycle APIs.
4. Add centralized authorization, rate limiting and audit instrumentation.
5. Only then begin workflow engine and AI gateway.

## Decisions to confirm before enabling paid production features

- Initial launch jurisdictions (for payroll and privacy obligations).
- Subscription currency, billing provider and trial/plan limits.
- Email and WhatsApp providers and verified sender identities.
- Hosting choice for Redis and background workers.
- AI provider, data retention policy and whether customer data may be sent to that provider.
- Required SSO/MFA options and data residency expectations.

## Current known limitations

The current release has basic company registration/login, departments, employee records, attendance and leave. Payroll, recruitment, performance, expenses, subscriptions, workflow execution, AI assistant, session revocation, audit trails, rate limiting, MFA/SSO and comprehensive automated tests are not yet production-complete. A successful Vercel deployment and database health check do not by themselves establish production readiness.
