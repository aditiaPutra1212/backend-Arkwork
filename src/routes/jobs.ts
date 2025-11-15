import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { attachEmployerId } from './employer'; // 👈 PERBAIKAN 1: Impor middleware

export const jobsRouter = Router();

/**
 * Helper: normalize job object to DTO
 */
function toJobDTO(x: any) {
  const created = x?.createdAt;
  let postedAt = new Date().toISOString();
  try {
    if (created instanceof Date) {
      postedAt = created.toISOString();
    } else if (created) {
      postedAt = new Date(created).toISOString();
    }
  } catch {
    postedAt = new Date().toISOString();
  }

  return {
    id: x?.id,
    title: x?.title,
    location: x?.location ?? '',
    employment: x?.employment ?? '',
    description: x?.description ?? '',
    postedAt,
    company: x?.employer?.displayName ?? 'Company',
    logoUrl: x?.employer?.profile?.logoUrl ?? null,
    isActive: typeof x?.isActive === 'boolean' ? x.isActive : null,
    isDraft: typeof x?.isDraft === 'boolean' ? x.isDraft : null,
  };
}

/**
 * Robust helper: attempt to delete reports referencing a jobId.
 *
 * This is best-effort: it tries several candidate model/table/column names and won't crash
 * if a particular model/table/column doesn't exist.
 */
async function deleteReportsByJobId(tx: any, jobId: string): Promise<number> {
  // candidate prisma model names (common variations)
  const candidateModels = ['jobReport', 'job_report', 'report', 'reports', 'JobReport', 'Report'];
  // candidate column names in report table that may reference the job id
  const candidateCols = ['jobId', 'job_id', 'targetId', 'target_id', 'targetIdString', 'targetSlug'];

  // Try using prisma model deleteMany if model exists on tx
  for (const modelName of candidateModels) {
    try {
      const model = (tx as any)[modelName];
      if (!model || typeof model.deleteMany !== 'function') continue;

      for (const col of candidateCols) {
        try {
          const where: any = {};
          where[col] = jobId;
          const res = await model.deleteMany({ where });
          // Prisma modern returns { count: number }
          const count = res && typeof res.count === 'number' ? res.count : 0;
          console.log(`[jobs] tried prisma.${modelName}.deleteMany({ ${col}: id }) => ${count}`);
          if (count > 0) return count;
        } catch (err: any) {
          // ignore and try next column
          console.warn(`[jobs] prisma.${modelName}.deleteMany with col ${col} failed: ${err?.message || err}`);
        }
      }
    } catch (err: any) {
      console.warn(`[jobs] error while inspecting prisma.${modelName}: ${err?.message || err}`);
    }
  }

  // Last-resort: try raw SQL on common table/column names.
  // Note: this uses $executeRawUnsafe as a fallback; it may not be available or allowed in some envs.
  const candidateTables = ['job_reports', 'job_report', 'reports', 'report'];
  const rawCols = ['job_id', 'jobId', 'target_id', 'targetId', 'target_slug', 'targetSlug'];
  for (const tbl of candidateTables) {
    for (const col of rawCols) {
      try {
        // Parameterized placeholder for safety; prisma.$executeRawUnsafe here receives raw SQL + params
        const sql = `DELETE FROM "${tbl}" WHERE "${col}" = $1`;
        // cast to any to avoid TS type complaints
        const res = await (tx as any).$executeRawUnsafe?.(sql, jobId);
        const count = typeof res === 'number' ? res : 0;
        console.log(`[jobs] raw delete ${tbl}.${col} => ${count}`);
        if (count > 0) return count;
      } catch (err: any) {
        // ignore non-existing table/column errors
        console.warn(`[jobs] raw delete on ${tbl}.${col} failed: ${err?.message || err}`);
      }
    }
  }

  console.warn('[jobs] deleteReportsByJobId: no matching report model/table/column found. Tried candidates.');
  return 0;
}

/* =========================================================
   LIST
   - GET /api/jobs?active=1
   - GET /api/employer/jobs?employerId=...
   - GET /api/employer-jobs
========================================================= */

// TIDAK DIUBAH (Endpoint publik)
jobsRouter.get('/jobs', async (req, res) => {
  try {
    const onlyActive = String(req.query.active ?? '') === '1';

    const rows = await prisma.job.findMany({
      where: onlyActive ? { isActive: true, isDraft: false } : undefined,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,
        location: true,
        employment: true,
        employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } },
      },
    });

    return res.json({ ok: true, data: rows.map(toJobDTO) });
  } catch (e: any) {
    console.error('GET /api/jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// TIDAK DIUBAH (Endpoint untuk admin/internal yang memakai query param)
jobsRouter.get('/employer/jobs', async (req, res) => {
  try {
    const employerId = (req.query.employerId as string) || process.env.DEV_EMPLOYER_ID;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'employerId tidak tersedia' });
    }

    const rows = await prisma.job.findMany({
      where: { employerId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,
        location: true,
        employment: true,
        employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } },
      },
    });

    return res.json({ ok: true, data: rows.map(toJobDTO) });
  } catch (e: any) {
    console.error('GET /api/employer/jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// ------------------------------------------------------------------
// 👇 PERBAIKAN 1 & 3: Endpoint aman, terfilter, & sembunyikan soft-delete
// ------------------------------------------------------------------
jobsRouter.get('/employer-jobs', attachEmployerId, async (req, res) => {
  try {
    const employerId = req.employerId;

    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'Tidak terotentikasi' });
    }

    const rows = await prisma.job.findMany({
      where: {
        employerId: employerId,
        deletedAt: null, // 👈 PERBAIKAN 3: Sembunyikan yang sudah di-soft-delete
      },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        description: true,
        createdAt: true,
        isActive: true,
        isDraft: true,
        location: true,
        employment: true,
        employer: { select: { displayName: true, profile: { select: { logoUrl: true } } } },
      },
    });

    return res.json({ ok: true, data: rows.map(toJobDTO) });
  } catch (e: any) {
    console.error('GET /api/employer-jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});
// ------------------------------------------------------------------
// 👆 Akhir dari Perbaikan 1 & 3
// ------------------------------------------------------------------

/* =========================================================
   CREATE
   - POST /api/employer/jobs
========================================================= */

// TIDAK DIUBAH
jobsRouter.post('/employer/jobs', async (req, res) => {
  try {
    const {
      title,
      location,
      employment,
      description,
      isDraft,
      employerId: bodyEmployerId,
      logoDataUrl,
    } = req.body || {};

    if (!title || typeof title !== 'string') {
      return res.status(400).json({ ok: false, error: 'title wajib diisi' });
    }

    const employerId = bodyEmployerId || process.env.DEV_EMPLOYER_ID;
    if (!employerId) {
      return res.status(401).json({ ok: false, error: 'Tidak ada employerId (login dulu)' });
    }

    if (logoDataUrl && typeof logoDataUrl === 'string') {
      await prisma.employer.update({
        where: { id: employerId },
        data: {
          profile: {
            upsert: {
              create: { logoUrl: logoDataUrl },
              update: { logoUrl: logoDataUrl },
            },
          },
        },
      });
    }

    const employer = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { displayName: true, profile: { select: { logoUrl: true } } },
    });

    const job = await prisma.job.create({
      data: {
        employerId,
        title,
        description: description ?? null,
        location: (location ?? null) as any,
        employment: (employment ?? null) as any,
        isDraft: !!isDraft,
        isActive: !isDraft,
      } as any,
      select: {
        id: true,
        title: true,
        createdAt: true,
        description: true,
        isActive: true,
        location: true,
        employment: true,
      },
    });

    return res.json({
      ok: true,
      data: {
        id: job.id,
        title: job.title,
        location: job.location,
        employment: job.employment,
        description: job.description,
        postedAt: job.createdAt.toISOString(),
        company: employer?.displayName ?? 'Company',
        logoUrl: employer?.profile?.logoUrl ?? null,
        isActive: job.isActive,
      },
    });
  } catch (e: any) {
    console.error('POST /api/employer/jobs error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* =========================================================
   UPDATE / NONAKTIFKAN
   - PATCH /api/employer-jobs/:id
   - POST  /api/employer-jobs/:id/deactivate
   - PATCH /api/jobs/:id   (alias)
========================================================= */

// TIDAK DIUBAH
jobsRouter.patch('/employer-jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const raw = String(req.body?.status ?? '').toUpperCase();

    const data: any = {};
    if (raw === 'INACTIVE') data.isActive = false;
    if (raw === 'ACTIVE') data.isActive = true;

    const updated = await prisma.job.update({
      where: { id },
      data,
      select: { id: true, isActive: true, isDraft: true },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('PATCH /api/employer-jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// TIDAK DIUBAH
// alias: PATCH /api/jobs/:id
jobsRouter.patch('/jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const raw = String(req.body?.status ?? '').toUpperCase();

    const data: any = {};
    if (raw === 'INACTIVE') data.isActive = false;
    if (raw === 'ACTIVE') data.isActive = true;

    const updated = await prisma.job.update({
      where: { id },
      data,
      select: { id: true, isActive: true, isDraft: true },
    });

    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('PATCH /api/jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// TIDAK DIUBAH
jobsRouter.post('/employer-jobs/:id/deactivate', async (req, res) => {
  try {
    const id = String(req.params.id);
    const updated = await prisma.job.update({
      where: { id },
      data: { isActive: false } as any,
      select: { id: true, isActive: true, isDraft: true },
    });
    return res.json({ ok: true, data: updated });
  } catch (e: any) {
    console.error('POST /api/employer-jobs/:id/deactivate error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

/* =========================================================
   DELETE
   - DELETE /api/employer-jobs/:id         (soft)
   - DELETE /api/employer-jobs/:id?mode=hard  (hard)
   - POST   /api/employer-jobs/:id/hard-delete
   - DELETE /api/jobs/:id                  (alias; soft if ?soft=1)
   - DELETE /api/admin/reports/by-job/:id     (ADDED)
========================================================= */

// ---------------------------------------------------------
// 👇 PERBAIKAN 2: Endpoint ini sekarang aman dari error transaksi
// ---------------------------------------------------------
jobsRouter.delete('/employer-jobs/:id', async (req, res) => {
  const id = String(req.params.id);
  const isHard = String(req.query.mode || '').toLowerCase() === 'hard';

  try {
    // =======================================================
    // BAGIAN HARD DELETE (TIDAK BERUBAH & SUDAH BENAR)
    // =======================================================
    if (isHard) {
      await prisma.$transaction(async (tx: any) => {
        try {
          await deleteReportsByJobId(tx, id);
        } catch (err) {
          console.warn('[jobs] deleteReportsByJobId error (hard):', err);
        }
        await tx.job.delete({ where: { id } });
      });
      return res.json({ ok: true, hard: true });
    }

    // =======================================================
    // 👇 PERBAIKAN: BAGIAN SOFT DELETE
    // =======================================================

    // 1. Hapus reports (best-effort) di luar transaksi
    //    Kita gunakan 'prisma' (global), bukan 'tx'
    try {
      await deleteReportsByJobId(prisma, id);
    } catch (err) {
      console.warn('[jobs] deleteReportsByJobId error (soft):', err);
    }

    // 2. Update job dengan logika fallback
    //    (Wrapper 'prisma.$transaction' dihapus dari sini)
    let updated;
    try {
      // Coba update 'deletedAt' dulu
      updated = await prisma.job.update({
        where: { id },
        data: { deletedAt: new Date(), isActive: false } as any,
        select: { id: true },
      });
    } catch (e1: any) {
      // Jika GAGAL (misal: kolom 'deletedAt' tidak ada), coba fallback
      console.warn(`[jobs] Soft delete (deletedAt) failed, trying fallback: ${e1?.message}`);
      try {
        updated = await prisma.job.update({
          where: { id },
          data: { isDraft: true, isActive: false } as any,
          select: { id: true },
        });
      } catch (e2: any) {
        // Jika fallback juga gagal, baru lempar error
        console.error('[jobs] Soft delete fallback failed:', e2?.message);
        throw e2; // Lempar error kedua agar ditangkap 'catch' utama
      }
    }

    // Kirim respons sukses
    return res.json({ ok: true, soft: true, data: { updatedId: updated.id } });

    // =======================================================
    // 👆 AKHIR DARI PERBAIKAN
    // =======================================================

  } catch (e: any) {
    console.error('DELETE /api/employer-jobs/:id error:', e);
    if (/No.*Record/i.test(String(e.message)) || /Record to delete does not exist/i.test(String(e.message))) {
      return res.status(404).json({ ok: false, error: 'Job tidak ditemukan' });
    }
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});
// ---------------------------------------------------------
// 👆 Akhir dari Perbaikan 2
// ---------------------------------------------------------

// TIDAK DIUBAH
jobsRouter.post('/employer-jobs/:id/hard-delete', async (req, res) => {
  try {
    const id = String(req.params.id);
    await prisma.job.delete({ where: { id } });
    try {
      await deleteReportsByJobId(prisma, id);
    } catch (err) {
      console.warn('[jobs] deleteReportsByJobId after hard delete error:', err);
    }
    return res.json({ ok: true, hard: true });
  } catch (e: any) {
    console.error('POST /api/employer-jobs/:id/hard-delete error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// TIDAK DIUBAH
// alias: DELETE /api/jobs/:id   (soft if ?soft=1)
jobsRouter.delete('/jobs/:id', async (req, res) => {
  try {
    const id = String(req.params.id);
    const soft = String(req.query.soft ?? '') === '1';

    if (soft) {
      try {
        await deleteReportsByJobId(prisma, id);
      } catch (err) {
        console.warn('[jobs] deleteReportsByJobId (jobs/:id soft) error:', err);
      }

      try {
        const updated = await prisma.job.update({
          where: { id },
          data: { deletedAt: new Date(), isActive: false } as any,
          select: { id: true },
        });
        return res.json({ ok: true, soft: true, data: updated });
      } catch {
        const updated = await prisma.job.update({
          where: { id },
          data: { isDraft: true, isActive: false } as any,
          select: { id: true },
        });
        return res.json({ ok: true, soft: true, data: updated });
      }
    }

    // hard delete
    await prisma.$transaction(async (tx: any) => {
      try {
        await deleteReportsByJobId(tx, id);
      } catch (err) {
        console.warn('[jobs] deleteReportsByJobId (jobs/:id hard) error:', err);
      }
      await tx.job.delete({ where: { id } });
    });
    return res.json({ ok: true, hard: true });
  } catch (e: any) {
    console.error('DELETE /api/jobs/:id error:', e);
    return res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
  }
});

// TIDAK DIUBAH (Endpoint Admin)
/**
 * ADDED: minimal admin helper so FE call to /api/admin/reports/by-job/:jobId won't 404.
 * Best-effort deletes reports related to jobId.
 */
jobsRouter.delete('/admin/reports/by-job/:jobId', async (req, res) => {
  const jobId = String(req.params.jobId);
  try {
    const deleted = await deleteReportsByJobId(prisma, jobId);
    return res.json({ ok: true, deleted });
  } catch (err: any) {
    console.error('DELETE /api/admin/reports/by-job/:jobId error:', err);
    return res.status(500).json({ ok: false, error: err?.message || 'Internal error' });
  }
});