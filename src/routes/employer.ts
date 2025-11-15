// src/routes/employer.ts
import { Router, Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { parse as parseCookie } from 'cookie';
import path from 'node:path';
import fs from 'node:fs';
import multer from 'multer';
import bcrypt from 'bcryptjs';
import { prisma } from '../lib/prisma';

// ⬇️ gunakan service billing agar email terkirim
import {
  startTrial,                 // startTrial({ employerId, planId, trialDays }) -> { trialEndsAt: Date }
  activatePremium,            // activatePremium({ employerId, planId, interval, baseFrom? }) -> { premiumUntil: Date }
} from '../services/billing';

export const employerRouter = Router();

/* ================== TYPE AUGMENTATION ================== */
declare module 'express-serve-static-core' {
  interface Request {
    employerId?: string | null;
    employerSessionId?: string | null;
    employerAdminUserId?: string | null;
  }
}

/* ================== AUTH ================== */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EMP_SESSION_COOKIE = 'emp_session';
const EMP_TOKEN_COOKIE = 'emp_token';

type EmployerJWTPayload = {
  uid: string; // employer admin user id
  role: 'employer';
  eid: string; // employerId
  iat?: number;
  exp?: number;
};

async function authFromSession(req: Request) {
  const sid = parseCookie(req.headers.cookie || '')[EMP_SESSION_COOKIE];
  if (!sid) return null;

  const s = await prisma.session.findUnique({
    where: { id: sid },
    select: { id: true, employerId: true, revokedAt: true, expiresAt: true },
  });

  const now = new Date();
  if (!s || !s.employerId || s.revokedAt || (s.expiresAt && s.expiresAt < now)) return null;

  return { employerId: s.employerId as string, sessionId: s.id as string };
}

function authFromToken(req: Request) {
  const token = parseCookie(req.headers.cookie || '')[EMP_TOKEN_COOKIE];
  if (!token) return null;
  try {
    const p = jwt.verify(token, JWT_SECRET) as EmployerJWTPayload;
    if (p.role !== 'employer' || !p.eid) return null;
    return { employerId: p.eid, adminUserId: p.uid };
  } catch {
    return null;
  }
}

async function resolveEmployerAuth(req: Request) {
  const bySess = await authFromSession(req);
  if (bySess) {
    return {
      employerId: bySess.employerId,
      sessionId: bySess.sessionId,
      adminUserId: null as string | null,
    };
  }

  const byJwt = authFromToken(req);
  if (byJwt) {
    return {
      employerId: byJwt.employerId,
      sessionId: null as string | null,
      adminUserId: byJwt.adminUserId ?? null,
    };
  }

  const header = (req.headers['x-employer-id'] as string | undefined)?.trim() || null;
  const query = (req.query?.employerId as string | undefined)?.trim() || null;
  const env = process.env.DEV_EMPLOYER_ID || null;

  const employerId = header || query || env;
  if (!employerId) return null;

  return { employerId, sessionId: null as string | null, adminUserId: null as string | null };
}

export async function attachEmployerId(req: Request, _res: Response, next: NextFunction) {
  try {
    const auth = await resolveEmployerAuth(req);
    req.employerId = auth?.employerId ?? null;
    req.employerSessionId = auth?.sessionId ?? null;
    req.employerAdminUserId = auth?.adminUserId ?? null;
  } catch {
    req.employerId = null;
    req.employerSessionId = null;
    req.employerAdminUserId = null;
  }
  next();
}

/* ================== Small utils ================== */
function slugify(s: string) {
  return (s || '')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '')
    .slice(0, 60);
}
async function uniqueSlug(base: string) {
  let s = slugify(base) || 'company';
  let i = 1;
  while (await prisma.employer.findUnique({ where: { slug: s } })) {
    s = `${slugify(base)}-${i++}`;
  }
  return s;
}

/* ================== /auth/me & /me ================== */
async function handleMe(req: Request, res: Response) {
  const auth = await resolveEmployerAuth(req);
  if (!auth?.employerId) {
    return res.status(401).json({ ok: false, message: 'Unauthorized' });
  }

  const employer = await prisma.employer.findUnique({
    where: { id: auth.employerId },
    select: { id: true, slug: true, displayName: true, legalName: true, website: true },
  });
  if (!employer) {
    return res.status(404).json({ ok: false, message: 'Employer not found' });
  }

  const adminUserId = auth.adminUserId;
  const admin = adminUserId
    ? await prisma.employerAdminUser
        .findUnique({
          where: { id: adminUserId },
          select: { id: true, email: true, fullName: true, isOwner: true },
        })
        .catch(() => null as any)
    : null;

  const fallbackName =
    employer.displayName ||
    admin?.fullName ||
    employer.legalName ||
    'Company';

  return res.json({
    ok: true,
    role: 'employer',
    employer: {
      id: employer.id,
      slug: employer.slug,
      displayName: employer.displayName ?? fallbackName,
      legalName: employer.legalName,
      website: employer.website,
    },
    admin: admin
      ? { id: admin.id, email: admin.email, fullName: admin.fullName, isOwner: admin.isOwner }
      : null,
    sessionId: auth.sessionId,
  });
}

employerRouter.get('/auth/me', handleMe);
employerRouter.get('/me', handleMe);

/* ================== STEP 1: buat akun employer + admin owner ================== */
employerRouter.post('/step1', async (req, res) => {
  try {
    const {
      companyName,
      displayName,
      email,
      password,
      confirmPassword,
      website,
      agree,
    } = req.body || {};

    if (!companyName || !email || !password || !confirmPassword) {
      return res.status(400).json({ error: 'Missing required fields' });
    }
    if (password !== confirmPassword) {
      return res.status(400).json({ error: 'Password mismatch' });
    }
    if (agree !== true) {
      return res.status(400).json({ error: 'You must agree to the Terms' });
    }

    const slug = await uniqueSlug(displayName || companyName);
    const hash = await bcrypt.hash(password, 10);

    const employer = await prisma.employer.create({
      data: {
        slug,
        legalName: companyName,
        displayName: displayName || companyName,
        website: website || null,
        admins: {
          create: {
            email,
            passwordHash: hash,
            isOwner: true,
          },
        },
        profile: { create: {} },
      },
      include: { admins: true },
    });

    return res.json({ ok: true, employerId: employer.id, slug: employer.slug });
  } catch (e: any) {
    if (e?.code === 'P2002') {
      return res.status(409).json({ error: 'Email or slug already exists' });
    }
    console.error('step1 error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/* ================== STEP 2: update profil ================== */
employerRouter.post('/step2', async (req, res) => {
  try {
    const { employerId, ...profile } = req.body || {};
    if (!employerId) return res.status(400).json({ error: 'employerId required' });

    await prisma.employerProfile.upsert({
      where: { employerId },
      update: {
        industry: profile.industry ?? undefined,
        size: profile.size ?? undefined,
        foundedYear: profile.foundedYear ?? undefined,
        about: profile.about ?? undefined,
        hqCity: profile.hqCity ?? undefined,
        hqCountry: profile.hqCountry ?? undefined,
        logoUrl: profile.logoUrl ?? undefined,
        bannerUrl: profile.bannerUrl ?? undefined,
      },
      create: {
        employerId,
        industry: profile.industry ?? null,
        size: profile.size ?? null,
        foundedYear: profile.foundedYear ?? null,
        about: profile.about ?? null,
        hqCity: profile.hqCity ?? null,
        hqCountry: profile.hqCountry ?? null,
        logoUrl: profile.logoUrl ?? null,
        bannerUrl: profile.bannerUrl ?? null,
      },
    });

    await prisma.employer.update({
      where: { id: employerId },
      data: { onboardingStep: 'VERIFY' },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('step2 error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/* ================== STEP 3: pilih paket (trial/gratis/berbayar) ================== */
/**
 * Body: { employerId, planSlug }
 * Result:
 *  - { ok: true, mode: 'trial', trialEndsAt }
 *  - { ok: true, mode: 'free_active', premiumUntil }
 *  - { ok: true, mode: 'needs_payment' }
 */
employerRouter.post('/step3', async (req, res) => {
  try {
    const { employerId, planSlug } = req.body as { employerId: string; planSlug: string };
    if (!employerId || !planSlug) return res.status(400).json({ error: 'employerId & planSlug required' });

    const employer = await prisma.employer.findUnique({ where: { id: employerId } });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.active) return res.status(400).json({ error: 'Plan not available' });

    // === TRIAL → gunakan service (email terkirim di dalamnya)
    if ((plan.trialDays ?? 0) > 0) {
      const { trialEndsAt } = await startTrial({
        employerId,
        planId: plan.id,
        trialDays: plan.trialDays,
      });

      await prisma.employer.update({
        where: { id: employerId },
        data: { onboardingStep: 'VERIFY' },
      });

      return res.json({ ok: true, mode: 'trial', trialEndsAt: trialEndsAt.toISOString() });
    }

    const amount = Number(plan.amount ?? 0);

    // === GRATIS → aktifkan premium via service (email terkirim di dalamnya)
    if (amount === 0) {
      const { premiumUntil } = await activatePremium({
        employerId,
        planId: plan.id,
        interval: (plan.interval as 'month' | 'year') || 'month',
      });

      await prisma.employer.update({
        where: { id: employerId },
        data: { onboardingStep: 'VERIFY' },
      });

      return res.json({ ok: true, mode: 'free_active', premiumUntil: premiumUntil.toISOString() });
    }

    // === BERBAYAR & tanpa trial → perlu checkout (email akan dikirim via webhook Midtrans setelah sukses)
    await prisma.employer.update({
      where: { id: employerId },
      data: { currentPlanId: plan.id, onboardingStep: 'VERIFY' },
    });

    return res.json({ ok: true, mode: 'needs_payment' });
  } catch (e) {
    console.error('step3 error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/* ================== STEP 5: submit verifikasi ================== */
employerRouter.post('/step5', async (req, res) => {
  try {
    const { employerId, note } = req.body || {};
    if (!employerId) return res.status(400).json({ error: 'employerId required' });

    await prisma.verificationRequest.create({
      data: {
        employerId,
        status: 'pending',
        note: note ?? null,
      },
    });

    return res.json({ ok: true });
  } catch (e) {
    console.error('step5 error', e);
    return res.status(500).json({ error: 'Internal error' });
  }
});

/* ================== Upload logo ================== */
const uploadsRoot = path.join(process.cwd(), 'public', 'uploads');
fs.mkdirSync(uploadsRoot, { recursive: true });

function pickEmployerIdForStorage(req: Request): string {
  const byAttach = (req.employerId as string | null) || undefined;
  const byHeader = (req.headers['x-employer-id'] as string | undefined)?.trim();
  const byToken = authFromToken(req)?.employerId;
  return byAttach || byHeader || byToken || 'unknown';
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

employerRouter.post('/profile/logo', upload.single('file'), async (req, res) => {
  const mreq = req as MulterReq;
  const auth = await resolveEmployerAuth(req);
  const employerId =
    req.employerId ||
    (mreq.body?.employerId as string | undefined) ||
    auth?.employerId ||
    null;

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

export default employerRouter;
