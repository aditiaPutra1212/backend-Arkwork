import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { withUserSession } from '../middleware/user-session';

const router = Router();

/**
 * GET /api/users/applications
 * Return list lamaran milik user saat ini
 */
router.get('/users/applications', withUserSession, async (req, res) => {
  try {
    const userId = (req as any).userId as string;

    const apps = await prisma.jobApplication.findMany({
      where: { applicantId: userId },
      orderBy: { createdAt: 'desc' },
      select: {
        jobId: true,
        status: true,
        createdAt: true,
        job: { select: { title: true, location: true } },
      },
    });

    const rows = apps.map((a) => ({
      jobId: a.jobId,
      title: a.job?.title ?? `Job ${a.jobId}`,
      location: a.job?.location ?? '-',
      appliedAt: a.createdAt,         // FE kita map ke appliedAt
      status: a.status,               // enum ApplicationStatus
    }));

    res.json({ ok: true, rows });
  } catch (e: any) {
    res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

export default router;
