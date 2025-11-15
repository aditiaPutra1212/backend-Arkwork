import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';
import { randomBytes } from 'crypto';
// Pastikan path import mailer ini benar menunjuk ke file mailer.ts Anda
import { sendVerificationEmail } from '../lib/mailer';
// Pastikan path import middleware role ini benar
import { ADMIN_COOKIE, EMP_COOKIE, USER_COOKIE } from '../middleware/role';
import * as authController from '../controllers/auth.controller';

const router = Router();

/* ===== env & cookie flags ===== */
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';

const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? undefined : 'dev-secret-change-me');
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'; // Untuk link verifikasi

if (IS_PROD && !JWT_SECRET) console.error('[FATAL] JWT_SECRET is required in production');
if (IS_PROD && !process.env.JWT_ADMIN_SECRET) console.error('[FATAL] JWT_ADMIN_SECRET is recommended');

const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE as 'lax' | 'none' | 'strict') || (IS_PROD ? 'none' : 'lax');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (IS_PROD && COOKIE_SAMESITE === 'none');

if (!IS_PROD) {
  console.log(`[AUTH] Running in dev mode. Cookie defaults: sameSite=${COOKIE_SAMESITE}, secure=${COOKIE_SECURE}`);
}

/* ===== JWT options ===== */
const JWT_USER_ISSUER = process.env.JWT_USER_ISSUER || 'arkwork';
const JWT_USER_AUDIENCE = process.env.JWT_USER_AUDIENCE || 'arkwork-users';
const JWT_ADMIN_ISSUER = process.env.JWT_ADMIN_ISSUER || 'arkwork-admin';
const JWT_ADMIN_AUDIENCE = process.env.JWT_ADMIN_AUDIENCE || 'arkwork-admins';

/* ===== helpers ===== */
type JWTPayload = { uid: string; role: 'user' | 'admin' | 'employer'; iat?: number; exp?: number; aud?: string; iss?: string };

// --- TAMBAHKAN EXPORT ---
export function signUserToken(payload: { uid: string; role?: string }) {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.sign({ uid: payload.uid, role: payload.role ?? 'user' }, JWT_SECRET, {
    expiresIn: '30d',
    issuer: JWT_USER_ISSUER,
    audience: JWT_USER_AUDIENCE,
  });
}

// --- TAMBAHKAN EXPORT JIKA DIPERLUKAN DI TEMPAT LAIN ---
export function signAdminToken(payload: { uid: string; role?: string }) {
  if (!JWT_ADMIN_SECRET) throw new Error('JWT_ADMIN_SECRET not set');
  return jwt.sign({ uid: payload.uid, role: payload.role ?? 'admin' }, JWT_ADMIN_SECRET, {
    expiresIn: '7d',
    issuer: JWT_ADMIN_ISSUER,
    audience: JWT_ADMIN_AUDIENCE,
  });
}

// --- TAMBAHKAN EXPORT JIKA DIPERLUKAN DI TEMPAT LAIN ---
export function verifyUserToken(token: string): JWTPayload {
  if (!JWT_SECRET) throw new Error('JWT_SECRET not set');
  return jwt.verify(token, JWT_SECRET, { issuer: JWT_USER_ISSUER, audience: JWT_USER_AUDIENCE }) as JWTPayload;
}

// --- TAMBAHKAN EXPORT JIKA DIPERLUKAN DI TEMPAT LAIN ---
export function verifyAdminToken(token: string): JWTPayload {
  if (!JWT_ADMIN_SECRET) throw new Error('JWT_ADMIN_SECRET not set');
  return jwt.verify(token, JWT_ADMIN_SECRET, { issuer: JWT_ADMIN_ISSUER, audience: JWT_ADMIN_AUDIENCE }) as JWTPayload;
}

// --- TAMBAHKAN EXPORT ---
export function setCookie(res: Response, name: string, token: string, maxAgeSec = 7 * 24 * 60 * 60) {
  const opts: any = {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: maxAgeSec * 1000,
  };
  console.log(`[AUTH][setCookie] Setting cookie '${name}' with options:`, opts);
  res.cookie(name, token, opts);
}

// --- TAMBAHKAN EXPORT ---
export function clearCookie(res: Response, name: string) {
  const opts = {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE,
    path: '/',
    maxAge: 0,
  };
  console.log(`[AUTH][clearCookie] Clearing cookie '${name}' with options:`, opts);
  res.clearCookie(name, opts);
}

/* ===== validators ===== */
const userSignupSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters").max(100),
  email: z.string().email("Invalid email address"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

const userSigninSchema = z.object({
  usernameOrEmail: z.string().min(3, "Email/Username is required"),
  password: z.string().min(1, "Password is required"),
});

const adminSigninSchema = z.object({
  username: z.string().min(3),
  password: z.string().min(1),
});

const verifyTokenSchema = z.object({
  token: z.string().length(64, "Invalid token format").regex(/^[a-f0-9]+$/i, "Invalid token characters"),
});

/* ===== routes ===== */

router.get('/', (_req, res) => res.json({ message: 'Auth route works!' }));

router.post('/forgot', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);

router.get('/verify-token/:token', authController.verifyToken);

/* ----- USER SIGNUP (Sends Verification Email) ----- */
router.post('/signup', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = userSignupSchema.safeParse(req.body);
    if (!parsed.success) {
      // [DIUBAH] Pesan error lebih ramah dan aman
      return res.status(400).json({ message: "Data yang Anda masukkan tidak valid. Periksa kembali." });
    }
    const { name, email, password } = parsed.data;
    const lowerEmail = email.toLowerCase().trim();
    const exists = await prisma.user.findUnique({ where: { email: lowerEmail } });
    if (exists) {
      if (!exists.isVerified && exists.verificationTokenExpiresAt && exists.verificationTokenExpiresAt > new Date()) {
        // [LOG DIHAPUS]
        return res.status(409).json({ message: 'Email registered, awaiting verification. Check inbox/spam.' });
      }
      return res.status(409).json({ message: 'Email address already registered.' });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    if (!passwordHash) throw new Error("Password hashing failed");
    const user = await prisma.user.create({
      data: { name: name.trim(), email: lowerEmail, passwordHash, isVerified: false },
      select: { id: true, email: true, name: true },
    });
    const token = randomBytes(32).toString('hex');
    const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
    await prisma.user.update({
      where: { id: user.id },
      data: { verificationToken: token, verificationTokenExpiresAt: expires },
    });
    const verificationUrl = `${FRONTEND_URL}/auth/verify?token=${token}`;
    try {
      await sendVerificationEmail(user.email, user.name, verificationUrl);
      console.log(`[AUTH][SIGNUP] Verification email initiated for ${user.email}`);
    } catch (emailError: any) {
      console.error(`[AUTH][SIGNUP] CRITICAL: Email send failed for ${user.email}:`, emailError?.message || emailError);
      await prisma.user.delete({ where: { id: user.id } }).catch(delErr => console.error(`[AUTH][SIGNUP] Rollback failed for user ${user.id}`, delErr));
      return res.status(500).json({ message: 'Verification email failed. Please try again.' });
    }
    return res.status(201).json({
      ok: true,
      message: 'Account created! Check email inbox/spam for verification link.'
    });
  } catch (e: any) {
    console.error('[AUTH][SIGNUP] Error:', e);
    if (e.code === 'P2002' && e.meta?.target?.includes('email')) {
      return res.status(409).json({ message: 'Email address already registered.' });
    }
    next(e);
  }
});

/* ----- USER SIGNIN (Checks Verification Status) ----- */
router.post('/signin', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = userSigninSchema.safeParse(req.body);
    if (!parsed.success) {
      // [DIUBAH] Pesan error lebih ramah dan aman
      return res.status(400).json({ message: "Email/Username atau Password tidak boleh kosong." });
    }
    const { usernameOrEmail, password } = parsed.data;
    const input = usernameOrEmail.trim();
    const userCredentials = input.includes('@')
      ? await prisma.user.findUnique({ where: { email: input.toLowerCase() }, select: { id: true, passwordHash: true, isVerified: true, email: true } })
      : await prisma.user.findFirst({ where: { name: input }, select: { id: true, passwordHash: true, isVerified: true, email: true } });
    
    if (!userCredentials) {
      // [LOG DIHAPUS]
      return res.status(401).json({ message: 'Incorrect credentials.' });
    }
    if (!userCredentials.passwordHash) {
      // [LOG DIHAPUS]
      return res.status(401).json({ message: 'Account uses Google Sign-In.' });
    }
    const passwordMatch = await bcrypt.compare(password, userCredentials.passwordHash);
    if (!passwordMatch) {
      // [LOG DIHAPUS]
      return res.status(401).json({ message: 'Incorrect password.' });
    }
    if (!userCredentials.isVerified) {
      // [LOG DIHAPUS]
      return res.status(403).json({ message: 'Email not verified. Check inbox/spam.' });
    }
    const user = await prisma.user.findUnique({
      where: { id: userCredentials.id },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true }
    });
    if (!user) {
      console.error(`[AUTH][SIGNIN][FAIL] Verified user vanished: ${userCredentials.id}`);
      return res.status(500).json({ message: 'Internal error.' });
    }
    console.log(`[AUTH][SIGNIN] User ${user.email} authenticated.`);
    const token = signUserToken({ uid: user.id, role: 'user' });
    setCookie(res, USER_COOKIE, token, 30 * 24 * 60 * 60); // Use USER_COOKIE
    return res.json({ ok: true, user: { ...user, role: 'user' } });
  } catch (e: any) {
    console.error('[AUTH][SIGNIN] Error:', e);
    next(e);
  }
});

/* ----- USER SIGNOUT ----- */
router.post('/signout', (_req: Request, res: Response) => {
  clearCookie(res, USER_COOKIE);
  clearCookie(res, EMP_COOKIE);
  clearCookie(res, ADMIN_COOKIE);
  return res.status(204).end();
});

/* ----- ME (Checks Verification Status) ----- */
router.get('/me', async (req: Request, res: Response, next: NextFunction) => {
  const cookies = parse(req.headers.cookie || '');
  const userToken = cookies[USER_COOKIE];
  const adminToken = cookies[ADMIN_COOKIE];

  if (adminToken) { /* ... Admin check ... */
    if (!JWT_ADMIN_SECRET) { return res.status(500).json({ message: 'Server misconfiguration' }); }
    try {
      const payload = verifyAdminToken(adminToken); console.log('[AUTH][ME] Decoded Admin Payload:', payload);
      if (!payload || !payload.uid) throw new Error("Invalid admin payload");
      const a = await prisma.admin.findUnique({ where: { id: payload.uid }, select: { id: true, username: true, createdAt: true } });
      if (!a) { clearCookie(res, ADMIN_COOKIE); return res.status(401).json({ message: 'Admin session invalid.' }); }
      return res.json({ ok: true, data: { ...a, role: 'admin' } });
    } catch (err: any) { clearCookie(res, ADMIN_COOKIE); if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) { return res.status(401).json({ message: `Unauthorized (Admin): ${err.message}` }); } console.error('[AUTH][ME] Admin check error:', err); return next(err); }
  }

  if (userToken) { /* ... User check ... */
    if (!JWT_SECRET) { return res.status(500).json({ message: 'Server misconfiguration' }); }
    try {
      const payload = verifyUserToken(userToken); console.log('[AUTH][ME] Decoded User Payload:', payload);
      if (!payload || !payload.uid) throw new Error("Invalid user payload");
      const u = await prisma.user.findUnique({
        where: { id: payload.uid },
        select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true, isVerified: true }
      });
      if (!u) {
        // [LOG DIHAPUS]
        clearCookie(res, USER_COOKIE); return res.status(401).json({ message: 'User session invalid.' });
      }
      if (!u.isVerified) {
        // [LOG DIHAPUS]
        clearCookie(res, USER_COOKIE); return res.status(403).json({ message: 'Account not verified.' });
      }
      const { isVerified, ...userDataToSend } = u;
      return res.json({ ok: true, data: { ...userDataToSend, role: 'user' } });
    } catch (err: any) {
      // [LOG DIHAPUS]
      clearCookie(res, USER_COOKIE);
      if (err instanceof jwt.JsonWebTokenError || err instanceof jwt.TokenExpiredError) {
        return res.status(401).json({ message: `Unauthorized (User): ${err.message}` });
      }
      console.error('[AUTH][ME] User check unexpected error:', err);
      return next(err);
    }
  }

  return res.status(401).json({ message: 'Unauthorized: No session found' });
});

/* ----- VERIFY EMAIL ----- */
router.post('/verify', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const parsed = verifyTokenSchema.safeParse(req.body);
    if (!parsed.success) {
      // [LOG DIHAPUS]
      return res.status(400).json({ message: "Invalid verification link format." });
    }
    const { token } = parsed.data;
    console.log(`[AUTH][VERIFY] Verifying token prefix: ${token.substring(0, 10)}...`);
    const user = await prisma.user.findFirst({
      where: { verificationToken: token, verificationTokenExpiresAt: { gt: new Date() }, isVerified: false },
    });
    if (!user) {
      // [LOG DIHAPUS]
      const existingTokenUser = await prisma.user.findFirst({ where: { verificationToken: token } });
      if (existingTokenUser?.isVerified) return res.status(400).json({ message: "Email already verified. Please log in." });
      if (existingTokenUser?.verificationTokenExpiresAt && existingTokenUser.verificationTokenExpiresAt <= new Date()) return res.status(400).json({ message: "Verification link expired." });
      return res.status(400).json({ message: "Invalid verification link." });
    }
    console.log(`[AUTH][VERIFY] Token valid for user: ${user.email}`);
    const updatedUser = await prisma.user.update({
      where: { id: user.id },
      data: { isVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true },
    });
    const loginToken = signUserToken({ uid: updatedUser.id, role: 'user' });
    setCookie(res, USER_COOKIE, loginToken, 30 * 24 * 60 * 60); // Auto-login
    console.log(`[AUTH][VERIFY] User ${user.email} verified & logged in.`);
    return res.json({ ok: true, message: 'Email verified! You are logged in.', user: { ...updatedUser, role: 'user' } });
  } catch (e: any) {
    console.error('[AUTH][VERIFY] Error:', e);
    if (e.code === 'P2002') console.error(`[AUTH][VERIFY] CRITICAL: Duplicate token!`);
    return res.status(500).json({ message: 'Internal verification error.' });
  }
});

/* ----- ADMIN SIGNIN ----- */
router.post('/admin/signin', async (req: Request, res: Response, next: NextFunction) => {
  /* ... Admin signin logic ... */
  try {
    const parsed = adminSigninSchema.safeParse(req.body); 
    if (!parsed.success) { 
      // [DIUBAH] Pesan error lebih ramah dan aman
      return res.status(400).json({ message: "Username atau Password tidak boleh kosong." }); 
    }
    const { username, password } = parsed.data; const admin = await prisma.admin.findUnique({ where: { username } }); if (!admin) return res.status(401).json({ message: 'Incorrect credentials.' });
    if (!admin.passwordHash) { return res.status(500).json({ message: 'Admin config error.' }); }
    const ok = await bcrypt.compare(password, admin.passwordHash); if (!ok) return res.status(401).json({ message: 'Incorrect credentials.' });
    const token = signAdminToken({ uid: admin.id, role: 'admin' }); setCookie(res, ADMIN_COOKIE, token, 7 * 24 * 60 * 60);
    return res.json({ ok: true, data: { id: admin.id, username: admin.username, role: 'admin' } });
  } catch (e: any) { console.error('ADMIN SIGNIN ERROR:', e); next(e); }
});

/* ----- ADMIN SIGNOUT ----- */
router.post('/admin/signout', (_req: Request, res: Response) => {
  /* ... Admin signout logic ... */
  clearCookie(res, ADMIN_COOKIE); clearCookie(res, USER_COOKIE); clearCookie(res, EMP_COOKIE); return res.status(204).end();
});
export default router;