// backend/src/middleware/role.ts
import { Request, Response, NextFunction } from 'express';
import jwt, { JwtPayload } from 'jsonwebtoken';

// default secrets (dev fallback)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;

// cookie names (bisa override via env)
export const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
export const EMP_COOKIE = process.env.EMP_COOKIE_NAME || 'emp_token';
export const USER_COOKIE = process.env.USER_COOKIE_NAME || 'user_token';

export type Role = 'admin' | 'employer' | 'user';
export type AuthPayload = { uid: string; role: Role; eid?: string | null };

/**
 * Helper: get token from cookie store (uses cookie-parser so req.cookies exists)
 */
function getCookieToken(req: Request, name: string): string | undefined {
  // cookie-parser populates req.cookies; fallback to raw header parse if needed
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const rc = (req as any).cookies;
  if (rc && typeof rc === 'object') {
    return rc[name] as string | undefined;
  }
  // fallback: try header parse (less preferred)
  const raw = req.headers.cookie || '';
  try {
    // lightweight parse: find "name="
    const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
    if (!m) return undefined;
    return decodeURIComponent(m.substring(name.length + 1));
  } catch {
    return undefined;
  }
}

/** Verify user token (throws on invalid) */
export function readUserAuth(req: Request): AuthPayload {
  const token = getCookieToken(req, USER_COOKIE);
  if (!token) throw new Error('no user token');
  try {
    // you can add verify options (issuer/audience) here if you used them
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload & AuthPayload;
    if (!payload || !payload.uid) throw new Error('invalid token payload');
    return { uid: String(payload.uid), role: (payload.role as Role) ?? 'user', eid: payload.eid ?? null };
  } catch (err: any) {
    throw new Error(`invalid user token: ${err?.message ?? err}`);
  }
}

/** Verify employer token (throws on invalid) */
export function readEmployerAuth(req: Request): AuthPayload {
  const token = getCookieToken(req, EMP_COOKIE);
  if (!token) throw new Error('no employer token');
  try {
    const payload = jwt.verify(token, JWT_SECRET) as JwtPayload & AuthPayload;
    if (!payload || !payload.uid) throw new Error('invalid token payload');
    return { uid: String(payload.uid), role: (payload.role as Role) ?? 'employer', eid: payload.eid ?? null };
  } catch (err: any) {
    throw new Error(`invalid employer token: ${err?.message ?? err}`);
  }
}

/** Verify admin token (throws on invalid) */
export function readAdminAuth(req: Request): { uid: string; role: 'admin' } {
  const token = getCookieToken(req, ADMIN_COOKIE);
  if (!token) throw new Error('no admin token');
  try {
    const payload = jwt.verify(token, JWT_ADMIN_SECRET) as JwtPayload & { uid?: string; role?: string };
    if (!payload || !payload.uid) throw new Error('invalid token payload');
    return { uid: String(payload.uid), role: 'admin' };
  } catch (err: any) {
    throw new Error(`invalid admin token: ${err?.message ?? err}`);
  }
}

/* ===== guards (express middleware) ===== */

export function authRequired(req: Request, res: Response, next: NextFunction) {
  try {
    (req as any).auth = readUserAuth(req);
    return next();
  } catch (err) {
    // don't leak details to client, but log for debugging
    console.warn('[authRequired] auth failed:', (err as any).message || err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function employerRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const p = readEmployerAuth(req);
    (req as any).auth = p;
    if (p.role === 'employer' || p.role === 'admin') return next();
    return res.status(403).json({ message: 'Employer only' });
  } catch (err) {
    console.warn('[employerRequired] auth failed:', (err as any).message || err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const p = readAdminAuth(req);
    (req as any).auth = p;
    if (p.role === 'admin') return next();
    return res.status(403).json({ message: 'Admin only' });
  } catch (err) {
    console.warn('[adminRequired] auth failed:', (err as any).message || err);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
