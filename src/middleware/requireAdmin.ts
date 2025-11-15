// backend/src/middleware/requireAdmin.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';

const IS_LOCAL = process.env.NODE_ENV !== 'production';
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || '';

export function requireAdmin(req: Request & { user?: any }, res: Response, next: NextFunction) {
  // DEV bypass if explicitly enabled (only for dev convenience)
  if (IS_LOCAL && process.env.DEV_ADMIN === '1') return next();

  const raw = (req as any).cookies?.[ADMIN_COOKIE] ?? req.headers['cookie']?.split(';').map(s=>s.trim()).find(s=>s.startsWith(`${ADMIN_COOKIE}=`))?.split('=')[1];
  if (!raw) return res.status(401).json({ message: 'Unauthorized' });

  if (!JWT_ADMIN_SECRET) {
    console.error('[AUTH] JWT_ADMIN_SECRET not set');
    return res.status(500).json({ message: 'Server misconfiguration' });
  }

  try {
    const payload = jwt.verify(raw, JWT_ADMIN_SECRET) as any;
    if (!payload || payload.role !== 'admin' || !payload.uid) {
      return res.status(401).json({ message: 'Unauthorized' });
    }
    (req as any).user = { id: payload.uid, role: 'admin' };
    return next();
  } catch (err: any) {
    return res.status(401).json({ message: 'Invalid token' });
  }
}
