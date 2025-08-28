// backend/src/middleware/role.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { parse } from 'cookie';

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;

// use distinct cookies
export const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
export const EMP_COOKIE   = process.env.EMP_COOKIE_NAME   || 'emp_token';
export const USER_COOKIE  = process.env.USER_COOKIE_NAME  || 'user_token';

export type Role = 'admin' | 'employer' | 'user';
export type AuthPayload = { uid: string; role: Role; eid?: string | null };

/** generic cookie reader */
function readCookie(req: Request, name: string) {
  const raw = req.headers.cookie || '';
  return parse(raw || '')[name];
}

/** ---- readers ---- */
export function readUserAuth(req: Request): AuthPayload {
  const token = readCookie(req, USER_COOKIE);
  if (!token) throw new Error('no user token');
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function readEmployerAuth(req: Request): AuthPayload {
  const token = readCookie(req, EMP_COOKIE);
  if (!token) throw new Error('no employer token');
  return jwt.verify(token, JWT_SECRET) as AuthPayload;
}

export function readAdminAuth(req: Request): { uid: string; role: 'admin' } {
  const token = readCookie(req, ADMIN_COOKIE);
  if (!token) throw new Error('no admin token');
  return jwt.verify(token, JWT_ADMIN_SECRET) as { uid: string; role: 'admin' };
}

/** ---- guards ---- */
export function authRequired(req: Request, res: Response, next: NextFunction) {
  try {
    (req as any).auth = readUserAuth(req);
    return next();
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function employerRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const p = readEmployerAuth(req);
    (req as any).auth = p;
    if (p.role === 'employer' || p.role === 'admin') return next();
    return res.status(403).json({ message: 'Employer only' });
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

export function adminRequired(req: Request, res: Response, next: NextFunction) {
  try {
    const p = readAdminAuth(req);
    (req as any).auth = p;
    if (p.role === 'admin') return next();
    return res.status(403).json({ message: 'Admin only' });
  } catch {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}
