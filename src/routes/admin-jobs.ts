// backend/src/routes/admin-jobs.ts
import { Router } from "express";
import { prisma } from "../lib/prisma";
import { requireAuth } from "../middleware/requireAuth";
import { requireAdmin } from "../middleware/requireAdmin";

const router = Router();

// Protect all routes in this router
router.use(requireAuth, requireAdmin);

/**
 * GET /jobs
 * Query:
 *  - q=keyword
 *  - employerId=uuid
 *  - status=active|draft|hidden|deleted|all (default: active)
 *  - page=1&limit=20
 */
router.get("/", async (req, res) => {
  try {
    const { q, employerId, status = "active", page = "1", limit = "20" } =
      req.query as Record<string, string>;

    const take = Math.min(Number.parseInt(String(limit), 10) || 20, 100);
    const pageNum = Math.max(Number.parseInt(String(page), 10) || 1, 1);
    const skip = (pageNum - 1) * take;

    const where: any = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: "insensitive" } },
        { description: { contains: q, mode: "insensitive" } },
        { location: { contains: q, mode: "insensitive" } },
        { employer: { is: { displayName: { contains: q, mode: "insensitive" } } } },
      ];
    }

    if (employerId) where.employerId = String(employerId);

    switch (String(status)) {
      case "active":
        Object.assign(where, { isActive: true, isDraft: false });
        break;
      case "draft":
        Object.assign(where, { isDraft: true });
        break;
      case "hidden":
      case "deleted":
        Object.assign(where, { isActive: false, isDraft: false });
        break;
      case "all":
      default:
        break;
    }

    const [items, total] = await Promise.all([
      prisma.job.findMany({
        where,
        orderBy: { createdAt: "desc" },
        take,
        skip,
        select: {
          id: true,
          title: true,
          isActive: true,
          isDraft: true,
          createdAt: true,
          employerId: true,
          location: true,
          employment: true,
          description: true,
          employer: { select: { id: true, displayName: true } },
        },
      }),
      prisma.job.count({ where }),
    ]);

    res.json({ items, total, page: pageNum, limit: take });
  } catch (e: any) {
    console.error("[/api/admin/jobs] error:", e);
    res.status(500).json({ message: e?.message || "Failed to fetch jobs" });
  }
});

/** SOFT DELETE = set isActive=false */
router.delete("/:id", async (req, res) => {
  try {
    const id = String(req.params.id);

    // cek eksistensi
    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    await prisma.job.update({ where: { id }, data: { isActive: false } });

    // audit log (opsional)
    console.info(`[ADMIN] user=${(req as any).user?.userId ?? "unknown"} soft-deleted job=${id}`);

    res.status(204).end();
  } catch (e: any) {
    console.error("[soft delete] error:", e);
    res.status(500).json({ message: e?.message || "Soft delete failed" });
  }
});

/** HARD DELETE = hapus permanen */
router.delete("/:id/hard", async (req, res) => {
  try {
    const id = String(req.params.id);

    const job = await prisma.job.findUnique({ where: { id } });
    if (!job) return res.status(404).json({ message: "Job not found" });

    await prisma.$transaction(async (tx) => {
      // Hapus child jika perlu
      // await tx.application.deleteMany({ where: { jobId: id } });
      // await tx.savedJob.deleteMany({ where: { jobId: id } });
      // await tx.jobReport.deleteMany({ where: { jobId: id } });

      await tx.job.delete({ where: { id } });
    });

    console.info(`[ADMIN] user=${(req as any).user?.userId ?? "unknown"} hard-deleted job=${id}`);

    res.status(204).end();
  } catch (e: any) {
    console.error("[hard delete] error:", e);
    res.status(400).json({ message: e?.message || "Hard delete failed" });
  }
});

export default router;
