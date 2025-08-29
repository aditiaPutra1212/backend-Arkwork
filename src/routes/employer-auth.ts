import { Router } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { parse as parseCookie, serialize as serializeCookie } from 'cookie';
import jwt from 'jsonwebtoken';

const EMP_COOKIE = 'emp_session';
const EMP_JWT = 'emp_token';
const SESSION_HOURS = 12;
const isProd = process.env.NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';

function makeSessionCookie(id: string) {
  return serializeCookie(EMP_COOKIE, id, {
    httpOnly: true,
    secure: isProd,      // wajib true kalau SameSite=None
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

function makeJwtCookie(token: string) {
  return serializeCookie(EMP_JWT, token, {
    httpOnly: true,
    secure: isProd,
    sameSite: 'none',
    path: '/',
    maxAge: SESSION_HOURS * 60 * 60,
  });
}

const router = Router();

/**
 * POST /api/employers/auth/signin
 * body: { usernameOrEmail|email, password }
 */
router.post('/signin', async (req, res) => {
  const usernameOrEmail = req.body?.usernameOrEmail ?? req.body?.email;
  const { password } = req.body || {};
  if (!usernameOrEmail || !password) {
    return res.status(400).json({ error: 'MISSING_CREDENTIALS' });
  }

  const admin = await prisma.employerAdminUser.findFirst({
    where: { OR: [{ email: usernameOrEmail }, { fullName: usernameOrEmail }] },
    select: { id: true, email: true, passwordHash: true, employerId: true },
  });
  if (!admin || !admin.passwordHash) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ error: 'INVALID_CREDENTIALS' });

  const employer = await prisma.employer.findUnique({
    where: { id: admin.employerId },
    select: { id: true, slug: true, displayName: true },
  });
  if (!employer) return res.status(401).json({ error: 'NO_EMPLOYER' });

  const now = Date.now();
  const session = await prisma.session.create({
    data: {
      userId: null,
      employerId: employer.id,
      createdAt: new Date(now),
      lastSeenAt: new Date(now),
      expiresAt: new Date(now + SESSION_HOURS * 60 * 60 * 1000),
      ip: req.ip,
      userAgent: req.get('user-agent') || '',
    },
    select: { id: true },
  });

  // 🔐 JWT untuk endpoint yang membaca emp_token
  const token = jwt.sign(
    { uid: admin.id, role: 'employer', eid: employer.id },
    JWT_SECRET,
    { expiresIn: `${SESSION_HOURS}h` }
  );

  res.setHeader('Set-Cookie', [makeSessionCookie(session.id), makeJwtCookie(token)]);
  return res.json({ ok: true, admin: { id: admin.id, email: admin.email }, employer });
});

/** POST /api/employers/auth/signout */
router.post('/signout', async (req, res) => {
  try {
    const { [EMP_COOKIE]: sid } = parseCookie(req.headers.cookie || '');
    if (sid) {
      await prisma.session.updateMany({
        where: { id: sid, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }
  } catch {}
  res.setHeader('Set-Cookie', [
    serializeCookie(EMP_COOKIE, '', { httpOnly: true, secure: isProd, sameSite: 'none', path: '/', maxAge: 0 }),
    serializeCookie(EMP_JWT, '', { httpOnly: true, secure: isProd, sameSite: 'none', path: '/', maxAge: 0 }),
  ]);
  res.status(204).end();
});

/** GET /api/employers/auth/me */
router.get('/me', async (req, res) => {
  const { [EMP_COOKIE]: sid } = parseCookie(req.headers.cookie || '');
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
      select: { id: true, slug: true, displayName: true, legalName: true, website: true },
    }),
    prisma.employerAdminUser.findFirst({
      where: { employerId: s.employerId },
      orderBy: { isOwner: 'desc' },
      select: { id: true, email: true, fullName: true, isOwner: true },
    }),
  ]);

  if (!employer) return res.status(404).json({ error: 'EMPLOYER_NOT_FOUND' });

  return res.json({ ok: true, role: 'employer', employer, admin: admin ?? null });
});

export default router;
