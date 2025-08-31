// src/routes/employer-auth.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';

const router = Router();

/* ========================= Session / Cookie ========================= */
const EMP_COOKIE = 'emp_session';
const SESSION_HOURS = 12;
const isProd = process.env.NODE_ENV === 'production';

function makeCookie(sessionId: string) {
  return serializeCookie(EMP_COOKIE, sessionId, {
    httpOnly: true,
    secure: true, // wajib true untuk SameSite=None pada https cross-site
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60, // detik
  });
}

function clearCookie() {
  return serializeCookie(EMP_COOKIE, '', {
    httpOnly: true,
    secure: true,
    sameSite: isProd ? 'none' : 'lax',
    path: '/',
    maxAge: 0, // hapus cookie
  });
}

function getSessionIdFromReq(req: { headers?: Record<string, any> }): string | undefined {
  try {
    const raw = req.headers?.cookie || '';
    return parseCookie(raw)[EMP_COOKIE];
  } catch {
    return undefined;
  }
}

/* =============================== Routes ============================== */
/**
 * POST /api/employers/auth/signin
 * Body: { usernameOrEmail, password } atau { email, password }
 */
router.post('/signin', async (req, res) => {
  const rawIdentifier =
    (req.body?.usernameOrEmail ?? req.body?.email ?? '').toString().trim();
  const password = (req.body?.password ?? '').toString();

  if (!rawIdentifier || !password) {
    return res.status(400).json({ error: 'MISSING_CREDENTIALS' });
  }

  // Normalisasi email untuk pencarian insensitive
  const asEmailLower = rawIdentifier.toLowerCase();
  const looksLikeEmail = /\S+@\S+\.\S+/.test(rawIdentifier);

  // Cari admin: email insensitive, atau fullName insensitive (kalau dulu pernah login pakai nama)
  const admin = await prisma.employerAdminUser.findFirst({
    where: {
      OR: [
        { email: { equals: asEmailLower, mode: 'insensitive' } },
        { fullName: { equals: rawIdentifier, mode: 'insensitive' } },
        // kalau kamu punya kolom username, bisa tambahkan baris berikut:
        // { username: { equals: rawIdentifier, mode: 'insensitive' } },
      ],
    },
    select: {
      id: true,
      email: true,
      passwordHash: true,
      employerId: true,
      employer: { select: { id: true, slug: true, displayName: true } },
    },
  });

  if (!admin || !admin.passwordHash) {
    return res.status(401).json({ error: 'USER_NOT_FOUND' });
  }

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  const employer = await prisma.employer.findUnique({
    where: { id: admin.employerId },
    select: { id: true, slug: true, displayName: true },
  });
  if (!employer) return res.status(401).json({ error: 'NO_EMPLOYER' });

  // Buat session
  const now = Date.now();
  const session = await prisma.session.create({
    data: {
      userId: null,
      employerId: employer.id,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + SESSION_HOURS * 60 * 60 * 1000),
      ip: (req as any).ip,
      userAgent: req.get('user-agent') || '',
    },
    select: { id: true },
  });

  // Set cookie cross-site
  res.setHeader('Set-Cookie', makeCookie(session.id));

  return res.json({
    ok: true,
    admin: { id: admin.id, email: admin.email },
    employer,
  });
});

/**
 * POST /api/employers/auth/signout
 */
router.post('/signout', async (req, res) => {
  try {
    const sid = getSessionIdFromReq(req);
    if (sid) {
      await prisma.session.updateMany({
        where: { id: sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch {
    // ignore
  }
  res.setHeader('Set-Cookie', clearCookie());
  res.status(204).end();
});

/**
 * GET /api/employers/auth/me
 * Validasi session dari cookie & balikan employer + admin info
 */
router.get('/me', async (req, res) => {
  const sid = getSessionIdFromReq(req);
  if (!sid) return res.status(401).json({ error: 'NO_SESSION' });

  const s = await prisma.session.findUnique({
    where: { id: sid },
    select: { employerId: true, revokedAt: true, expiresAt: true },
  });

  if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date()) || !s.employerId) {
    return res.status(401).json({ error: 'NO_SESSION' });
  }

  const [employer, admin] = await Promise.all([
    prisma.employer.findUnique({
      where: { id: s.employerId },
      select: {
        id: true,
        slug: true,
        displayName: true,
        legalName: true,
        website: true,
      },
    }),
    prisma.employerAdminUser.findFirst({
      where: { employerId: s.employerId },
      orderBy: { isOwner: 'desc' },
      select: { id: true, email: true, fullName: true, isOwner: true },
    }),
  ]);

  if (!employer) return res.status(404).json({ error: 'EMPLOYER_NOT_FOUND' });

  return res.json({
    ok: true,
    role: 'employer',
    employer,
    admin: admin ?? {
      id: 'employer-admin',
      email: null,
      fullName: null,
      isOwner: undefined,
    },
  });
});

export default router;
