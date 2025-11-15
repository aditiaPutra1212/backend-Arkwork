// src/routes/employer-applications.ts
import { Router, Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import { withEmployerSession } from '../middleware/employer-session';
import { ApplicationStatus, Prisma } from '@prisma/client';

const router = Router();

/**
 * GET /api/employers/applications?jobId=<optional>&page=1&pageSize=20
 * employerId diambil dari cookie session (withEmployerSession)
 */
router.get('/', withEmployerSession, async (req: Request, res: Response) => {
  try {
    const employerId = (req as any).employerId as string | undefined;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const jobId = (req.query.jobId as string | undefined) || undefined;

    // pagination
    const page = Math.max(1, Number(req.query.page || 1));
    const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    // validasi UUID sederhana untuk jobId (opsional)
    const isUuid = (s?: string) =>
      !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
    if (jobId && !isUuid(jobId)) {
      return res.status(400).json({ ok: false, error: 'jobId harus UUID' });
    }

    // WHERE filter: aplikasi untuk job yang dimiliki employer yang login
    const where: Prisma.JobApplicationWhereInput = {
      job: { employerId, ...(jobId ? { id: jobId } : {}) },
    };

    // Ambil rows + relasi kandidat & job
    const apps = await prisma.jobApplication.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      skip,
      take,
      select: {
        id: true,
        status: true,
        createdAt: true,
        cvUrl: true,
        cvFileName: true,
        cvFileType: true,
        cvFileSize: true,
        applicant: { select: { name: true, email: true } },
        job: { select: { id: true, title: true } },
      },
    });

    const rows = apps.map((a) => ({
      id: a.id,
      candidateName: a.applicant?.name ?? '-',
      candidateEmail: a.applicant?.email ?? null,
      jobTitle: a.job?.title ?? (a.job?.id ? `Job ${a.job.id}` : 'Job'),
      status: a.status,
      createdAt: a.createdAt?.toISOString?.() ?? null,
      cv: a.cvUrl
        ? {
            url: a.cvUrl,
            name: a.cvFileName,
            type: a.cvFileType,
            size: a.cvFileSize,
          }
        : null,
    }));

    // Counters per status
    const grouped = await prisma.jobApplication.groupBy({
      by: ['status'],
      where,
      _count: { _all: true },
    });

    const counters: Record<ApplicationStatus, number> = {
      submitted: 0,
      review: 0,
      shortlist: 0,
      rejected: 0,
      hired: 0,
    };
    for (const g of grouped) {
      counters[g.status] = g._count._all;
    }

    return res.json({ ok: true, data: { rows, counters, page, pageSize } });
  } catch (e: any) {
    console.error('[GET /api/employers/applications] error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/**
 * PATCH /api/employers/applications/:id
 * Body: { status: 'submitted' | 'review' | 'shortlist' | 'rejected' | 'hired' }
 * Hanya boleh untuk aplikasi yang job-nya milik employer yang login.
 */
router.patch('/:id', withEmployerSession, async (req: Request, res: Response) => {
  try {
    const employerId = (req as any).employerId as string | undefined;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'Unauthorized' });
    }

    const id = req.params.id;
    const statusRaw: string = (req.body?.status || '').toString().toLowerCase();

    const allowed: ApplicationStatus[] = ['submitted', 'review', 'shortlist', 'rejected', 'hired'];
    if (!allowed.includes(statusRaw as ApplicationStatus)) {
      return res.status(400).json({ ok: false, error: 'Invalid status' });
    }

    // Pastikan aplikasi milik job yang employerId-nya = employer yang login
    const app = await prisma.jobApplication.findUnique({
      where: { id },
      select: { id: true, job: { select: { employerId: true } } },
    });
    if (!app || app.job.employerId !== employerId) {
      return res.status(404).json({ ok: false, error: 'Application not found' });
    }

    const updated = await prisma.jobApplication.update({
      where: { id },
      data: { status: statusRaw as ApplicationStatus },
      select: { id: true, status: true, updatedAt: true },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('[PATCH /api/employers/applications/:id] error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

export default router;
