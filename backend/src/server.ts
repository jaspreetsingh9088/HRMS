import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { PrismaClient } from '@prisma/client';

const app = express();
const prisma = new PrismaClient();
app.use(helmet());
app.use(cors({ origin: process.env.FRONTEND_URL?.split(',') ?? 'http://localhost:3000' }));
app.use(express.json({ limit: '1mb' }));

app.get('/api/v1/health', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; res.json({ status: 'ok', service: 'hrms-api', database: 'connected' }); }
  catch { res.status(503).json({ status: 'degraded', service: 'hrms-api', database: 'unavailable' }); }
});
app.get('/api/v1', (_req, res) => res.json({ name: 'PeopleFlow HRMS API', version: 'v1' }));

const port = Number(process.env.PORT ?? 4000);
const server = app.listen(port, () => console.log(`HRMS API listening on ${port}`));
const shutdown = async () => { server.close(); await prisma.$disconnect(); process.exit(0); };
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
