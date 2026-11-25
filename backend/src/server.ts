import 'dotenv/config';
import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient, MembershipRole, EmploymentStatus, LeaveStatus } from '@prisma/client';
import { randomBytes, scryptSync, timingSafeEqual, createHmac } from 'node:crypto';

const app = express();
const prisma = new PrismaClient();
const JWT_SECRET = process.env.JWT_ACCESS_SECRET;
if (!JWT_SECRET || JWT_SECRET.length < 32) throw new Error('JWT_ACCESS_SECRET must be at least 32 characters');
app.use(helmet());
app.use(cors({ origin: (process.env.FRONTEND_URL ?? 'http://localhost:3000').split(',').map(x => x.trim()), credentials: true }));
app.use(express.json({ limit: '1mb' }));

type Session = { userId: string; tenantId: string; role: MembershipRole; email: string; name: string; exp: number };
type AuthRequest = Request & { session?: Session };
const text = (v: unknown) => typeof v === 'string' ? v.trim() : '';
const emailValid = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);
const hashPassword = (password: string) => { const salt = randomBytes(16).toString('hex'); return salt + ':' + scryptSync(password, salt, 64).toString('hex'); };
const verifyPassword = (password: string, stored: string) => {
  const [salt, digest] = stored.split(':'); if (!salt || !digest) return false;
  const actual = scryptSync(password, salt, 64), expected = Buffer.from(digest, 'hex');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
};
const sign = (session: Omit<Session, 'exp'>) => {
  const payload = Buffer.from(JSON.stringify({ ...session, exp: Math.floor(Date.now() / 1000) + 60 * 60 * 12 })).toString('base64url');
  return payload + '.' + createHmac('sha256', JWT_SECRET!).update(payload).digest('base64url');
};
const decode = (value: string): Session => {
  const [payload, signature] = value.split('.');
  const expected = createHmac('sha256', JWT_SECRET!).update(payload).digest();
  const actual = Buffer.from(signature ?? '', 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid token');
  const session = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Session;
  if (session.exp < Date.now() / 1000) throw new Error('Expired token');
  return session;
};
function auth(req: AuthRequest, res: Response, next: NextFunction) {
  try {
    const header = req.headers.authorization ?? '';
    if (!header.startsWith('Bearer ')) return res.status(401).json({ error: 'Please sign in' });
    req.session = decode(header.slice(7));
    return next();
  } catch { return res.status(401).json({ error: 'Session expired. Please sign in again.' }); }
}
function allow(...roles: MembershipRole[]) {
  return (req: AuthRequest, res: Response, next: NextFunction) => {
    if (!req.session || !roles.includes(req.session.role)) return res.status(403).json({ error: 'You do not have permission for this action' });
    next();
  };
}
const tenantId = (req: AuthRequest) => req.session!.tenantId;
const todayRange = () => { const from = new Date(); from.setHours(0,0,0,0); const to = new Date(from); to.setDate(to.getDate()+1); return { from, to }; };

app.get('/api/v1/health', async (_req, res) => {
  try { await prisma.$queryRawUnsafe('SELECT 1'); res.json({ status: 'ok', service: 'hrms-api', database: 'connected' }); }
  catch { res.status(503).json({ status: 'degraded', service: 'hrms-api', database: 'unavailable' }); }
});
app.get('/api/v1', (_req, res) => res.json({ name: 'PeopleFlow HRMS API', version: '1.0.0' }));

app.post('/api/v1/auth/register', async (req, res) => {
  const name = text(req.body.name), company = text(req.body.company), email = text(req.body.email).toLowerCase(), password = text(req.body.password);
  if (!name || !company || !emailValid(email) || password.length < 10) return res.status(400).json({ error: 'Enter your name, company, valid email and a password of at least 10 characters' });
  try {
    if (await prisma.user.findUnique({ where: { email } })) return res.status(409).json({ error: 'This email is already registered. Please sign in.' });
    const slug = company.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 35) + '-' + randomBytes(3).toString('hex');
    const result = await prisma.$transaction(async tx => {
      const tenant = await tx.tenant.create({ data: { name: company, slug } });
      const user = await tx.user.create({ data: { name, email, passwordHash: hashPassword(password) } });
      const membership = await tx.membership.create({ data: { tenantId: tenant.id, userId: user.id, role: 'OWNER' } });
      await tx.department.createMany({ data: [{ tenantId: tenant.id, name: 'Human Resources', code: 'HR' }, { tenantId: tenant.id, name: 'Operations', code: 'OPS' }, { tenantId: tenant.id, name: 'Finance', code: 'FIN' }] });
      await tx.leaveType.createMany({ data: [{ tenantId: tenant.id, name: 'Annual Leave', annualAllowance: 18 }, { tenantId: tenant.id, name: 'Sick Leave', annualAllowance: 10 }, { tenantId: tenant.id, name: 'Casual Leave', annualAllowance: 7 }] });
      return { tenant, user, membership };
    });
    const session = { userId: result.user.id, tenantId: result.tenant.id, role: result.membership.role, email, name };
    return res.status(201).json({ token: sign(session), user: { id: result.user.id, name, email }, company: { id: result.tenant.id, name: company }, role: 'OWNER' });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Could not create company account' }); }
});
app.post('/api/v1/auth/login', async (req, res) => {
  const email = text(req.body.email).toLowerCase(), password = text(req.body.password);
  try {
    const user = await prisma.user.findUnique({ where: { email }, include: { memberships: { include: { tenant: true }, orderBy: { createdAt: 'asc' } } } });
    if (!user || !verifyPassword(password, user.passwordHash)) return res.status(401).json({ error: 'Email or password is incorrect' });
    const membership = user.memberships.find(m => m.tenant.status === 'ACTIVE');
    if (!membership) return res.status(403).json({ error: 'No active company workspace found' });
    const session = { userId: user.id, tenantId: membership.tenantId, role: membership.role, email: user.email, name: user.name };
    return res.json({ token: sign(session), user: { id: user.id, name: user.name, email: user.email }, company: { id: membership.tenant.id, name: membership.tenant.name }, role: membership.role });
  } catch (error) { console.error(error); return res.status(500).json({ error: 'Sign in failed' }); }
});
app.get('/api/v1/auth/me', auth, async (req: AuthRequest, res) => {
  const s = req.session!;
  const membership = await prisma.membership.findUnique({ where: { tenantId_userId: { tenantId: s.tenantId, userId: s.userId } }, include: { tenant: true } });
  if (!membership || membership.tenant.status !== 'ACTIVE') return res.status(403).json({ error: 'Workspace access is unavailable' });
  res.json({ user: { id: s.userId, name: s.name, email: s.email }, company: { id: s.tenantId, name: membership.tenant.name }, role: s.role });
});

app.get('/api/v1/auth/workspaces', auth, async (req: AuthRequest, res) => {
  const memberships = await prisma.membership.findMany({
    where: { userId: req.session!.userId, tenant: { status: 'ACTIVE' } },
    include: { tenant: true },
    orderBy: { createdAt: 'asc' }
  });
  res.json(memberships.map(m => ({
    tenantId: m.tenantId,
    name: m.tenant.name,
    slug: m.tenant.slug,
    role: m.role,
    current: m.tenantId === req.session!.tenantId
  })));
});

app.post('/api/v1/auth/switch-workspace', auth, async (req: AuthRequest, res) => {
  const requestedTenantId = text(req.body.tenantId);
  if (!requestedTenantId) return res.status(400).json({ error: 'Choose a company workspace' });
  const membership = await prisma.membership.findUnique({
    where: { tenantId_userId: { tenantId: requestedTenantId, userId: req.session!.userId } },
    include: { tenant: true, user: true }
  });
  if (!membership || membership.tenant.status !== 'ACTIVE') {
    return res.status(403).json({ error: 'You do not have access to this active workspace' });
  }
  const session = {
    userId: membership.userId,
    tenantId: membership.tenantId,
    role: membership.role,
    email: membership.user.email,
    name: membership.user.name
  };
  return res.json({
    token: sign(session),
    user: { id: membership.user.id, name: membership.user.name, email: membership.user.email },
    company: { id: membership.tenant.id, name: membership.tenant.name },
    role: membership.role
  });
});

app.get('/api/v1/dashboard', auth, async (req: AuthRequest, res) => {
  const t = tenantId(req), { from, to } = todayRange();
  const [totalEmployees, activeEmployees, presentToday, onLeaveToday, pendingLeaves, departmentCount, recentEmployees] = await Promise.all([
    prisma.employee.count({ where: { tenantId: t } }),
    prisma.employee.count({ where: { tenantId: t, status: 'ACTIVE' } }),
    prisma.attendance.count({ where: { tenantId: t, workDate: { gte: from, lt: to }, status: 'PRESENT' } }),
    prisma.attendance.count({ where: { tenantId: t, workDate: { gte: from, lt: to }, status: 'ON_LEAVE' } }),
    prisma.leaveRequest.count({ where: { tenantId: t, status: 'PENDING' } }),
    prisma.department.count({ where: { tenantId: t } }),
    prisma.employee.findMany({ where: { tenantId: t }, include: { department: true }, orderBy: { createdAt: 'desc' }, take: 6 })
  ]);
  res.json({ stats: { totalEmployees, activeEmployees, presentToday, onLeaveToday, pendingLeaves, departmentCount }, recentEmployees });
});

app.get('/api/v1/departments', auth, async (req: AuthRequest, res) => {
  res.json(await prisma.department.findMany({ where: { tenantId: tenantId(req) }, include: { _count: { select: { employees: true } } }, orderBy: { name: 'asc' } }));
});
app.post('/api/v1/departments', auth, allow('OWNER','COMPANY_ADMIN','HR_MANAGER'), async (req: AuthRequest, res) => {
  const name = text(req.body.name); if (!name) return res.status(400).json({ error: 'Department name is required' });
  try { return res.status(201).json(await prisma.department.create({ data: { tenantId: tenantId(req), name, code: text(req.body.code) || null } })); }
  catch { return res.status(409).json({ error: 'Department already exists' }); }
});

app.get('/api/v1/employees', auth, async (req: AuthRequest, res) => {
  const q = text(req.query.q), t = tenantId(req);
  const rows = await prisma.employee.findMany({ where: { tenantId: t, ...(q ? { OR: [{ firstName: { contains: q, mode: 'insensitive' as const } }, { lastName: { contains: q, mode: 'insensitive' as const } }, { employeeCode: { contains: q, mode: 'insensitive' as const } }, { workEmail: { contains: q, mode: 'insensitive' as const } }] } : {}) }, include: { department: true }, orderBy: { createdAt: 'desc' } });
  res.json(rows);
});
app.post('/api/v1/employees', auth, allow('OWNER','COMPANY_ADMIN','HR_MANAGER'), async (req: AuthRequest, res) => {
  const b = req.body, firstName = text(b.firstName), lastName = text(b.lastName), employeeCode = text(b.employeeCode), t = tenantId(req);
  if (!firstName || !lastName || !employeeCode) return res.status(400).json({ error: 'First name, last name and employee ID are required' });
  if (b.departmentId && !await prisma.department.findFirst({ where: { id: text(b.departmentId), tenantId: t } })) return res.status(400).json({ error: 'Selected department is invalid' });
  try { return res.status(201).json(await prisma.employee.create({ data: { tenantId: t, firstName, lastName, employeeCode, workEmail: text(b.workEmail) || null, jobTitle: text(b.jobTitle) || null, departmentId: text(b.departmentId) || null, joiningDate: b.joiningDate ? new Date(b.joiningDate) : null }, include: { department: true } })); }
  catch { return res.status(409).json({ error: 'Employee ID already exists or employee data is invalid' }); }
});
app.patch('/api/v1/employees/:id', auth, allow('OWNER','COMPANY_ADMIN','HR_MANAGER'), async (req: AuthRequest, res) => {
  const t = tenantId(req), old = await prisma.employee.findFirst({ where: { id: text(req.params.id), tenantId: t } });
  if (!old) return res.status(404).json({ error: 'Employee not found' });
  const b = req.body;
  if (b.departmentId && !await prisma.department.findFirst({ where: { id: text(b.departmentId), tenantId: t } })) return res.status(400).json({ error: 'Selected department is invalid' });
  try { return res.json(await prisma.employee.update({ where: { id: old.id }, data: { firstName: b.firstName === undefined ? undefined : text(b.firstName), lastName: b.lastName === undefined ? undefined : text(b.lastName), workEmail: b.workEmail === undefined ? undefined : (text(b.workEmail) || null), jobTitle: b.jobTitle === undefined ? undefined : (text(b.jobTitle) || null), departmentId: b.departmentId === undefined ? undefined : (text(b.departmentId) || null), status: b.status as EmploymentStatus | undefined }, include: { department: true } })); }
  catch { return res.status(400).json({ error: 'Employee update failed' }); }
});
app.delete('/api/v1/employees/:id', auth, allow('OWNER','COMPANY_ADMIN','HR_MANAGER'), async (req: AuthRequest, res) => {
  const row = await prisma.employee.findFirst({ where: { id: text(req.params.id), tenantId: tenantId(req) } });
  if (!row) return res.status(404).json({ error: 'Employee not found' });
  await prisma.employee.update({ where: { id: row.id }, data: { status: 'TERMINATED' } });
  res.json({ success: true, message: 'Employee marked as terminated' });
});

app.get('/api/v1/attendance', auth, async (req: AuthRequest, res) => {
  const t = tenantId(req), from = req.query.from ? new Date(String(req.query.from)) : todayRange().from, to = req.query.to ? new Date(String(req.query.to)) : todayRange().to;
  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) return res.status(400).json({ error: 'Invalid date filter' });
  res.json(await prisma.attendance.findMany({ where: { tenantId: t, workDate: { gte: from, lt: to } }, include: { employee: { include: { department: true } } }, orderBy: { workDate: 'desc' } }));
});
app.post('/api/v1/attendance/check-in', auth, async (req: AuthRequest, res) => {
  const t = tenantId(req), isAdmin = ['OWNER','COMPANY_ADMIN','HR_MANAGER'].includes(req.session!.role);
  const own = await prisma.employee.findFirst({ where: { tenantId: t, userId: req.session!.userId, status: 'ACTIVE' } });
  const employeeId = isAdmin ? (text(req.body.employeeId) || own?.id) : own?.id;
  if (!employeeId) return res.status(403).json({ error: 'Your user account is not linked to an employee profile' });
  if (!await prisma.employee.findFirst({ where: { id: employeeId, tenantId: t, status: 'ACTIVE' } })) return res.status(404).json({ error: 'Active employee not found' });
  const now = new Date(), workDate = new Date(now); workDate.setHours(0,0,0,0);
  try { return res.status(201).json(await prisma.attendance.create({ data: { tenantId: t, employeeId, workDate, checkIn: now, status: 'PRESENT' } })); }
  catch { return res.status(409).json({ error: 'Attendance has already been recorded today' }); }
});
app.post('/api/v1/attendance/:id/check-out', auth, async (req: AuthRequest, res) => {
  const row = await prisma.attendance.findFirst({ where: { id: text(req.params.id), tenantId: tenantId(req) }, include: { employee: true } });
  if (!row) return res.status(404).json({ error: 'Attendance record not found' });
  if (row.employee.userId !== req.session!.userId && !['OWNER','COMPANY_ADMIN','HR_MANAGER','MANAGER'].includes(req.session!.role)) return res.status(403).json({ error: 'You can only check out your own attendance' });
  if (row.checkOut) return res.status(409).json({ error: 'This attendance record is already checked out' });
  res.json(await prisma.attendance.update({ where: { id: row.id }, data: { checkOut: new Date() }, include: { employee: true } }));
});

app.get('/api/v1/leave-types', auth, async (req: AuthRequest, res) => res.json(await prisma.leaveType.findMany({ where: { tenantId: tenantId(req) }, orderBy: { name: 'asc' } })));
app.post('/api/v1/leave-types', auth, allow('OWNER','COMPANY_ADMIN','HR_MANAGER'), async (req: AuthRequest, res) => {
  const name = text(req.body.name), annualAllowance = Number(req.body.annualAllowance);
  if (!name || !Number.isFinite(annualAllowance) || annualAllowance < 0 || annualAllowance > 365) return res.status(400).json({ error: 'Enter a leave name and annual allowance between 0 and 365' });
  try { return res.status(201).json(await prisma.leaveType.create({ data: { tenantId: tenantId(req), name, annualAllowance } })); }
  catch { return res.status(409).json({ error: 'Leave type already exists' }); }
});
app.get('/api/v1/leaves', auth, async (req: AuthRequest, res) => res.json(await prisma.leaveRequest.findMany({ where: { tenantId: tenantId(req) }, include: { employee: true, leaveType: true }, orderBy: { createdAt: 'desc' } })));
app.post('/api/v1/leaves', auth, async (req: AuthRequest, res) => {
  const t = tenantId(req), b = req.body;
  const employee = b.employeeId ? await prisma.employee.findFirst({ where: { id: text(b.employeeId), tenantId: t } }) : await prisma.employee.findFirst({ where: { userId: req.session!.userId, tenantId: t } });
  const type = await prisma.leaveType.findFirst({ where: { id: text(b.leaveTypeId), tenantId: t } });
  const startDate = new Date(b.startDate), endDate = new Date(b.endDate);
  if (!employee || !type || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || endDate < startDate) return res.status(400).json({ error: 'Select an employee, leave type and valid date range' });
  if (employee.userId !== req.session!.userId && !['OWNER','COMPANY_ADMIN','HR_MANAGER','MANAGER'].includes(req.session!.role)) return res.status(403).json({ error: 'You can only request leave for your own profile' });
  const days = Math.floor((endDate.getTime() - startDate.getTime()) / 86400000) + 1;
  return res.status(201).json(await prisma.leaveRequest.create({ data: { tenantId: t, employeeId: employee.id, leaveTypeId: type.id, startDate, endDate, days, reason: text(b.reason) || null }, include: { employee: true, leaveType: true } }));
});
app.patch('/api/v1/leaves/:id/review', auth, allow('OWNER','COMPANY_ADMIN','HR_MANAGER','MANAGER'), async (req: AuthRequest, res) => {
  const status = text(req.body.status);
  if (!['APPROVED','REJECTED'].includes(status)) return res.status(400).json({ error: 'Choose APPROVED or REJECTED' });
  const row = await prisma.leaveRequest.findFirst({ where: { id: text(req.params.id), tenantId: tenantId(req), status: 'PENDING' } });
  if (!row) return res.status(404).json({ error: 'Pending leave request not found' });
  return res.json(await prisma.leaveRequest.update({ where: { id: row.id }, data: { status: status as LeaveStatus, reviewedByUserId: req.session!.userId, reviewedAt: new Date() }, include: { employee: true, leaveType: true } }));
});

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => { console.error(err); res.status(500).json({ error: 'Unexpected server error' }); });
const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log('HRMS API listening on ' + port));
const shutdown = async () => { server.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
