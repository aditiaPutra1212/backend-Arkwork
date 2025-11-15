/*
 * LOKASI FILE: backend/src/routes/reports.ts
 *
 * KODE INI SUDAH DIPERBAIKI
 */

import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma'; // <-- Tambahkan .js
import { Prisma, ReportReason, ReportStatus } from '@prisma/client';
import { requireAuth } from '../middleware/requireAuth'; // <-- Tambahkan .js
import { z } from 'zod';

const router = Router();

/* -------------------------- Validator (Zod Schema) -------------------------- */
const reportSchema = z.object({
  jobId: z.string().uuid({ message: "Job ID tidak valid." }),
  reason: z.nativeEnum(ReportReason),
  details: z.string().max(1000, "Detail terlalu panjang.").optional().nullable(),
  evidenceUrl: z.string().url("URL bukti tidak valid.").optional().nullable(),
});

/* -------------------------- Helpers -------------------------- */
// HAPUS 'RequestWithUser', TIPE GLOBAL DARI 'express.d.ts' AKAN DIGUNAKAN
// interface RequestWithUser extends Request {
//   user?: { id?: string; email?: string; };
// }

// Fungsi mapReasonInput (tidak berubah, asumsikan ada implementasinya)
function mapReasonInput(r?: string): ReportReason { return ReportReason.OTHER; }


/* -------------------------- CREATE (User Only) -------------------------- */
// Gunakan 'Request' standar, bukan 'RequestWithUser'
router.post('/', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const userId = req.user?.id; // Tipe global akan tahu 'req.user' punya 'id'

    const parsed = reportSchema.safeParse(req.body);

    // ▼▼▼ TAMBAHKAN VALIDASI ZOD YANG BENAR DI SINI ▼▼▼
    if (!parsed.success) {
      console.warn(`[Reports][CREATE] Validasi gagal:`, parsed.error.format());
      return res.status(400).json({ ok: false, message: "Input tidak valid.", errors: parsed.error.format() });
    }
    // ▲▲▲ SELESAI VALIDASI ▲▲▲

    // Sekarang aman untuk mengakses parsed.data
    const { jobId, reason, details, evidenceUrl } = parsed.data;

    const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true } });
    if (!job) {
      return res.status(404).json({ ok: false, message: "Job tidak ditemukan." });
    }

    const createdReport = await prisma.jobReport.create({
      data: { jobId, reason, details, evidenceUrl, reporterUserId: userId, status: ReportStatus.OPEN },
      select: { id: true, jobId: true, reason: true, details: true, evidenceUrl: true, status: true, createdAt: true, reporterUserId: true, job: { select: { title: true, employer: { select: { displayName: true } } } } },
    });
    console.log(`[Reports][CREATE] User ${userId} created report ${createdReport.id} for job ${jobId}`);
    return res.status(201).json({ ok: true, data: createdReport });
  } catch (e: any) {
    console.error('[Reports][POST /] Error:', e);
    res.status(500).json({ ok: false, message: 'Gagal membuat laporan.' });
  }
});


/* ---------------------------- LIST (Untuk Admin) --------------------------- */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = typeof req.query.q === 'string' ? req.query.q.trim() : undefined;
    const userId = typeof req.query.userId === 'string' ? req.query.userId.trim() : undefined;
    const jobId = typeof req.query.jobId === 'string' ? req.query.jobId.trim() : undefined;
    const status = typeof req.query.status === 'string' ? req.query.status.toUpperCase() as ReportStatus : undefined;
    if (status && !Object.values(ReportStatus).includes(status)) { return res.status(400).json({ ok: false, message: 'Nilai status tidak valid.' }); }
    let where: Prisma.JobReportWhereInput = {};
    const filters: Prisma.JobReportWhereInput[] = [];
    if (q) { filters.push({ OR: [ { details: { contains: q, mode: 'insensitive' } }, { job: { title: { contains: q, mode: 'insensitive' } } }, { job: { employer: { displayName: { contains: q, mode: 'insensitive' } } } } ] }); }
    if (userId) { filters.push({ reporterUserId: userId }); }
    if (jobId) { filters.push({ jobId: jobId }); }
    if (status) { filters.push({ status: status }); }
    if (filters.length > 0) { where = { AND: filters }; }


    // Ambil data dari DB dengan relasi
    const reports = await prisma.jobReport.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      take: 50,
      select: {
        id: true,
        jobId: true, // Penting untuk targetId
        reason: true,
        details: true,
        status: true,
        createdAt: true,
        reporterUserId: true,
        job: { // Sertakan relasi job -> employer
          select: {
            title: true, // Untuk 'judul'
            employer: {
              select: {
                displayName: true // Untuk 'perusahaan'
              }
            }
          }
        },
      },
    });

    // Mapping data untuk frontend admin
    const reportsWithTarget = reports.map(report => ({
      id: report.id,
      jobId: report.jobId,
      reason: report.reason,
      details: report.details,
      status: report.status,
      createdAt: report.createdAt.toISOString(), // Format tanggal
      reporterUserId: report.reporterUserId,
      
      // Data target
      targetType: 'JOB' as const, // Tipe target selalu JOB
      targetId: report.jobId,     // ID target adalah jobId
      
      // Field flat untuk kemudahan frontend
      judul: report.job?.title ?? null,
      perusahaan: report.job?.employer?.displayName ?? null,
    }));


    console.log("Data being sent from GET /api/reports:", reportsWithTarget.length); // Log jumlah

    // Kirim data yang sudah dimapping
    return res.json({ ok: true, data: reportsWithTarget });

  } catch (e: any) {
    console.error('[Reports][GET /] Error:', e);
    res.status(500).json({ ok: false, message: 'Gagal mengambil data laporan.' });
  }
});


/* --------------------------- DELETE -------------------------- */
// Gunakan 'Request' standar, bukan 'RequestWithUser'
router.delete('/:id', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const reportId = req.params.id;
    const userId = req.user?.id; // Tipe global akan tahu 'req.user' punya 'id'
    if (!userId) { return res.status(401).json({ ok: false, message: 'User not authenticated properly.' }); }
    const report = await prisma.jobReport.findUnique({ where: { id: reportId }, select: { id: true, reporterUserId: true } });
    if (!report) { return res.status(404).json({ ok: false, message: 'Laporan tidak ditemukan.' }); }
    if (report.reporterUserId !== userId) { return res.status(403).json({ ok: false, message: 'Anda tidak diizinkan menghapus laporan ini.' }); }
    await prisma.jobReport.delete({ where: { id: reportId } });
    console.info(`[Reports][DELETE] User ${userId} deleted report ${reportId}`);
    return res.status(204).end();
  } catch (e: any) {
    console.error('[Reports][DELETE /:id] Error:', e);
    res.status(500).json({ ok: false, message: 'Gagal menghapus laporan.' });
  }
});

export default router;