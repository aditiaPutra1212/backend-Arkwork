import { Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';

export async function withUserSession(req: Request, res: Response, next: NextFunction) {
  try {
    const sid = req.cookies?.sid || req.header('X-Session-Id'); // sesuaikan
    if (!sid) return res.status(401).json({ ok: false, error: 'Unauthorized (no sid)' });

    const s = await prisma.session.findFirst({
      where: { id: sid, revokedAt: null, expiresAt: { gt: new Date() } },
      select: { userId: true },
    });

    if (!s?.userId) return res.status(401).json({ ok: false, error: 'Unauthorized' });

    (req as any).userId = s.userId;
    next();
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Session error' });
  }
}
