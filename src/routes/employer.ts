import { Router, Request, Response } from 'express';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import {
  Step1Schema, Step2Schema, Step3Schema, Step4Schema, Step5Schema, Step5Input,
} from '../validators/employer';
import {
  checkAvailability,
  createAccount,
  upsertProfile,
  choosePlan,
  createDraftJob,
  submitVerification,
} from '../services/employer';
import { prisma } from '../lib/prisma';

export const employerRouter = Router();

declare module 'express-serve-static-core' {
  interface Request { employerId?: string | null }
}

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EMP_JWT = 'emp_token';
const EMP_COOKIE = 'emp_session';

type EmployerJWTPayload = { uid: string; role: 'employer'; eid: string; iat?: number; exp?: number };

/** 🔐 Ambil auth dari JWT atau fallback session DB */
async function getEmployerAuth(req: Request): Promise<{ adminUserId: string | null; employerId: string } | null> {
  const cookies = parseCookie(req.headers.cookie || '');

  // 1) JWT terlebih dahulu
  const token = cookies[EMP_JWT];
  if (token) {
    try {
      const payload = jwt.verify(token, JWT_SECRET) as EmployerJWTPayload;
      if (payload.role === 'employer' && payload.eid) {
        return { adminUserId: payload.uid || null, employerId: payload.eid };
      }
    } catch {}
  }

  // 2) Fallback: emp_session di DB
  const sid = cookies[EMP_COOKIE];
  if (!sid) return null;

  const s = await prisma.session.findUnique({
    where: { id: sid },
    select: { employerId: true, revokedAt: true, expiresAt: true },
  });
  if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date()) || !s.employerId) return null;

  const admin = await prisma.employerAdminUser.findFirst({
    where: { employerId: s.employerId },
    orderBy: { isOwner: 'desc' },
    select: { id: true },
  });

  return { adminUserId: admin?.id ?? null, employerId: s.employerId };
}

/** attach employerId ke req (header/query/auth/env) */
employerRouter.use(async (req, _res, next) => {
  try {
    const fromHeader = (req.headers['x-employer-id'] as string | undefined)?.trim();
    const fromQuery = (req.query?.employerId as string | undefined)?.trim();
    const fromEnv = process.env.DEV_EMPLOYER_ID;
    const auth = await getEmployerAuth(req);

    req.employerId = fromHeader || fromQuery || auth?.employerId || fromEnv || null;
    next();
  } catch (e) { next(e as any); }
});

/* ================== MULTER (upload logo) ================== */
const uploadsRoot = path.join(process.cwd(), 'public', 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

function pickEmployerIdForStorage(req: Request): string {
  const fromAttach = (req.employerId as string | null) || undefined;
  const fromHeader = (req.headers['x-employer-id'] as string | undefined)?.trim();
  return fromAttach || fromHeader || 'unknown';
}

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const eid = pickEmployerIdForStorage(req);
    const dir = path.join(uploadsRoot, 'employers', eid);
    fs.mkdirSync(dir, { recursive: true });
    cb(null, dir);
  },
  filename: (_req, file, cb) => {
    const ext = (path.extname(file.originalname) || '.jpg').toLowerCase();
    cb(null, 'logo' + ext);
  },
});
const upload = multer({
  storage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
      return cb(new Error('Only PNG/JPG/WebP allowed'));
    }
    cb(null, true);
  },
});
type MulterReq = Request & { file?: Express.Multer.File };

/* ================== ROUTES ================== */

employerRouter.get('/availability', async (req, res, next) => {
  try {
    const data = await checkAvailability({
      slug: (req.query.slug as string) || '',
      email: (req.query.email as string) || '',
    });
    res.json(data);
  } catch (e) { next(e); }
});

employerRouter.post('/step1', async (req, res, next) => {
  try {
    const parsed = Step1Schema.parse(req.body);
    const result = await createAccount(parsed);
    res.json({ ok: true, ...result, next: '/api/employers/step2' });
  } catch (e: any) {
    if (e?.code === 'P2002') return res.status(409).json({ error: 'Email already used' });
    if (e?.issues) return res.status(400).json({ error: 'Validation error', details: e.issues });
    next(e);
  }
});

employerRouter.post('/step2', async (req, res, next) => {
  try {
    const parsed = Step2Schema.parse(req.body);
    const { employerId, ...profile } = parsed;
    const data = await upsertProfile(employerId, profile);
    res.json({ ok: true, data, next: '/api/employers/step3' });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: 'Validation error', details: e.issues });
    next(e);
  }
});

employerRouter.post('/step3', async (req, res, next) => {
  try {
    const parsed = Step3Schema.parse(req.body);
    const data = await choosePlan(parsed.employerId, parsed.planSlug);
    res.json({ ok: true, data, next: '/api/employers/step4' });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: 'Validation error', details: e.issues });
    next(e);
  }
});

employerRouter.post('/step4', async (req, res, next) => {
  try {
    const parsed = Step4Schema.parse(req.body);
    const { employerId, ...rest } = parsed;
    const data = await createDraftJob(employerId, rest);
    res.json({ ok: true, data, next: '/api/employers/step5' });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: 'Validation error', details: e.issues });
    next(e);
  }
});

employerRouter.post('/step5', async (req, res, next) => {
  try {
    const parsed = Step5Schema.parse(req.body) as Step5Input;
    const data = await submitVerification(parsed.employerId, parsed.note, parsed.files as any);

    let slug: string | null = null;
    try {
      const emp = await prisma.employer.findUnique({ where: { id: parsed.employerId }, select: { slug: true } });
      slug = emp?.slug ?? null;
    } catch { slug = null; }

    res.json({
      ok: true,
      data,
      onboarding: 'completed',
      message: 'Verifikasi terkirim. Silakan sign in untuk melanjutkan.',
      signinRedirect: slug ? `/auth/signin?employerSlug=${encodeURIComponent(slug)}` : `/auth/signin`,
    });
  } catch (e: any) {
    if (e?.issues) return res.status(400).json({ error: 'Validation error', details: e.issues });
    next(e);
  }
});

/* --------- UTIL --------- */
employerRouter.get('/me', async (req: Request, res: Response) => {
  const auth = await getEmployerAuth(req);
  if (!auth) return res.status(401).json({ message: 'Unauthorized' });

  const employer = await prisma.employer.findUnique({
    where: { id: auth.employerId },
    select: { id: true, slug: true, displayName: true, legalName: true, website: true },
  });
  if (!employer) return res.status(404).json({ message: 'Employer not found' });

  const admin = auth.adminUserId
    ? await prisma.employerAdminUser.findUnique({
        where: { id: auth.adminUserId },
        select: { id: true, email: true, fullName: true, isOwner: true },
      }).catch(() => null as any)
    : null;

  return res.json({
    ok: true,
    role: 'employer',
    employer,
    admin: admin
      ? { id: admin.id, email: admin.email, fullName: admin.fullName, isOwner: admin.isOwner }
      : { id: 'employer-admin', email: null, fullName: null, isOwner: undefined },
  });
});

employerRouter.get('/profile', async (req, res) => {
  const employerId = req.employerId || (req.query?.employerId as string | undefined);
  if (!employerId) return res.status(400).json({ message: 'employerId required' });

  const profile = await prisma.employerProfile.findUnique({
    where: { employerId },
    select: {
      about: true, hqCity: true, hqCountry: true, logoUrl: true, bannerUrl: true,
      linkedin: true, instagram: true, twitter: true, industry: true, size: true,
      foundedYear: true, updatedAt: true,
    },
  });
  return res.json(profile || {});
});

employerRouter.post('/update-basic', async (req, res) => {
  const employerId = req.employerId || (req.body?.employerId as string | undefined);
  if (!employerId) return res.status(400).json({ message: 'employerId required' });

  const { displayName, legalName, website } = req.body || {};
  const data: any = {};
  if (typeof displayName === 'string') data.displayName = displayName.trim();
  if (typeof legalName === 'string') data.legalName = legalName.trim();
  if (typeof website === 'string' || website === null) data.website = website || null;
  if (!Object.keys(data).length) return res.json({ ok: true });

  const updated = await prisma.employer.update({
    where: { id: employerId },
    data,
    select: { id: true, displayName: true, legalName: true, website: true },
  });
  return res.json({ ok: true, employer: updated });
});

/* ------------------------- UPLOAD LOGO ------------------------- */
employerRouter.post('/profile/logo', upload.single('file'), async (req, res) => {
  const mreq = req as MulterReq;
  const employerId = req.employerId || (mreq.body?.employerId as string | undefined) || null;
  if (!employerId) return res.status(400).json({ message: 'employerId required' });
  if (!mreq.file) return res.status(400).json({ message: 'file required' });

  const dir = path.join(uploadsRoot, 'employers', employerId);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
    const from = path.join(uploadsRoot, 'employers', 'unknown', mreq.file.filename);
    const to = path.join(dir, mreq.file.filename);
    try { fs.renameSync(from, to); } catch {}
  }

  const publicUrl = `/uploads/employers/${employerId}/${mreq.file.filename}`;

  await prisma.employerProfile.upsert({
    where: { employerId },
    create: { employerId, logoUrl: publicUrl },
    update: { logoUrl: publicUrl },
  });

  return res.json({ ok: true, url: publicUrl });
});

/* --------- DUMMY --------- */
employerRouter.get('/stats', async (req, res) => {
  const employerId = req.employerId;
  if (!employerId) return res.status(401).json({ message: 'Unauthorized' });
  res.json({ activeJobs: 0, totalApplicants: 0, interviews: 0, views: 0, lastUpdated: new Date().toISOString() });
});

employerRouter.get('/jobs', async (req, res) => {
  const employerId = req.employerId;
  if (!employerId) return res.status(401).json({ message: 'Unauthorized' });
  res.json([]);
});

employerRouter.get('/applications', async (req, res) => {
  const employerId = req.employerId;
  if (!employerId) return res.status(401).json({ message: 'Unauthorized' });
  res.json([]);
});

export default employerRouter;
