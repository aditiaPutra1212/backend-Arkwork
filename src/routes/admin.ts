import { Router, Request, Response, NextFunction } from 'express';
import { PrismaClient } from '@prisma/client';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import * as cookie from 'cookie';

const prisma = new PrismaClient();
const router = Router();
const ADMIN_JWT_SECRET = process.env.JWT_ADMIN_SECRET || 'dev-admin-secret';

type AdminPayload = { aid: string };
const sign = (p: AdminPayload) => jwt.sign(p, ADMIN_JWT_SECRET, { expiresIn: '7d' });
const verify = (t: string) => jwt.verify(t, ADMIN_JWT_SECRET) as AdminPayload;

const setCookie = (res: Response, token: string) =>
  res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 7,
  }));

const clearCookie = (res: Response) =>
  res.setHeader('Set-Cookie', cookie.serialize('admin_token', '', {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 0,
  }));

const signinSchema = z.object({ username: z.string().min(3), password: z.string().min(6) });

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = cookie.parse(req.headers.cookie || '');
    const token = cookies['admin_token'];
    if (!token) return res.status(401).json({ message: 'Unauthorized' });
    (req as any).adminId = verify(token).aid;
    next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

// untuk test cepat
router.get('/ping', (_req, res) => res.json({ ok: true }));

router.post('/signin', async (req, res) => {
  const p = signinSchema.safeParse(req.body);
  if (!p.success) return res.status(400).json({ error: p.error.format() });

  const { username, password } = p.data;
  const admin = await prisma.admin.findUnique({ where: { username } });
  if (!admin) return res.status(401).json({ message: 'Username atau password salah' });

  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) return res.status(401).json({ message: 'Username atau password salah' });

  setCookie(res, sign({ aid: admin.id }));
  res.json({ id: admin.id, username: admin.username, createdAt: admin.createdAt });
});

router.post('/signout', (_req, res) => { clearCookie(res); res.status(204).end(); });

router.get('/me', requireAdmin, async (req, res) => {
  const admin = await prisma.admin.findUnique({
    where: { id: (req as any).adminId },
    select: { id: true, username: true, createdAt: true },
  });
  if (!admin) return res.status(401).json({ message: 'Unauthorized' });
  res.json(admin);
});

router.get('/stats', requireAdmin, async (_req, res) => {
  const users = await prisma.user.count();
  const admins = await prisma.admin.count();
  res.json({ users, admins });
});

export default router;
