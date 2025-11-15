// src/middleware/withEmployerSession.ts
import { NextFunction, Request, Response } from 'express';
import { parse as parseCookie } from 'cookie';
import { prisma } from '../lib/prisma'; // atau default export sesuai project

const EMP_COOKIE = 'emp_session';

declare global {
  namespace Express {
    interface Request {
      employerId?: string | null;
      employerSessionId?: string | null;
    }
  }
}

export async function withEmployerSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sid = parseCookie(req.headers.cookie || '')[EMP_COOKIE];
    if (!sid) return res.status(401).json({ message: 'Unauthorized' });

    const s = await prisma.session.findUnique({
      where: { id: sid },
      select: { id: true, employerId: true, revokedAt: true, expiresAt: true },
    });

    const now = new Date();
    if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < now) || !s.employerId) {
      return res.status(401).json({ message: 'Unauthorized' });
    }

    req.employerId = s.employerId;
    req.employerSessionId = s.id;
    next();
  } catch (e) {
    console.error('withEmployerSession error:', e);
    res.status(401).json({ message: 'Unauthorized' });
  }
}
