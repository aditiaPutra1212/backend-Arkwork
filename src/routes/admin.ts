// backend/src/routes/admin.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import bcrypt from 'bcryptjs';
import { z } from 'zod';
import jwt from 'jsonwebtoken';
import { ADMIN_COOKIE } from '../middleware/role';

const router = Router();

const IS_LOCAL = process.env.NODE_ENV !== 'production';

// tokens & cookie flags
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || 'dev-admin-secret';

// SameSite/secure defaults: local = None + not secure; prod = None + secure
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || (IS_LOCAL ? 'none' : 'none')) as
  | 'lax'
  | 'none'
  | 'strict';
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (!IS_LOCAL && COOKIE_SAMESITE === 'none'); // chrome requires Secure when SameSite=None on https (prod)

function signAdminToken(payload: { uid: string; role: 'admin' }) {
  return jwt.sign(payload, JWT_ADMIN_SECRET, { expiresIn: '7d' });
}

function setAdminCookie(res: Response, token: string) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE && !IS_LOCAL ? true : false, // keep false on localhost
    path: '/',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

const adminSigninSchema = z.object({
  usernameOrEmail: z.string().min(3),
  password: z.string().min(6),
});

router.post('/signin', async (req: Request, res: Response) => {
  try {
    const parsed = adminSigninSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: parsed.error.format() });
    }
    const { usernameOrEmail, password } = parsed.data;

    // resolve username by email or username
    const emailsEnv = (process.env.ADMIN_EMAILS || '')
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);
    const hasAt = usernameOrEmail.includes('@');
    const lower = usernameOrEmail.toLowerCase();

    let usernameToFind: string | null = null;

    if (hasAt) {
      if (emailsEnv.length > 0 && emailsEnv.includes(lower) && process.env.ADMIN_USERNAME) {
        usernameToFind = process.env.ADMIN_USERNAME;
      } else {
        usernameToFind = usernameOrEmail.split('@')[0];
      }
    } else {
      usernameToFind = usernameOrEmail;
    }

    const admin = await prisma.admin.findUnique({ where: { username: usernameToFind! } });
    if (!admin) return res.status(401).json({ message: 'Email/Username atau password salah' });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ message: 'Email/Username atau password salah' });

    const token = signAdminToken({ uid: admin.id, role: 'admin' });
    setAdminCookie(res, token);

    return res.json({ ok: true, admin: { id: admin.id, username: admin.username } });
  } catch (e) {
    console.error('ADMIN SIGNIN ERROR:', e);
    return res.status(500).json({ message: 'Internal server error' });
  }
});

// restore session
router.get('/me', async (req, res) => {
  try {
    const raw = req.cookies?.[ADMIN_COOKIE];
    if (!raw) return res.status(401).json({ message: 'Unauthorized' });
    const payload = jwt.verify(raw, JWT_ADMIN_SECRET) as { uid: string; role: 'admin' };

    const admin = await prisma.admin.findUnique({
      where: { id: payload.uid },
      select: { id: true, username: true },
    });
    if (!admin) return res.status(401).json({ message: 'Unauthorized' });

    return res.json({ id: admin.id, username: admin.username, role: 'admin' });
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }
});

// optional signout
router.post('/signout', (req, res) => {
  res.clearCookie(ADMIN_COOKIE, { path: '/' });
  res.json({ ok: true });
});

export default router;
