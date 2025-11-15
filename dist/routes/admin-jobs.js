"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/admin-jobs.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const requireAuth_1 = require("../middleware/requireAuth");
const requireAdmin_1 = require("../middleware/requireAdmin");
const router = (0, express_1.Router)();
// Protect all routes in this router
router.use(requireAuth_1.requireAuth, requireAdmin_1.requireAdmin);
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
        const { q, employerId, status = "active", page = "1", limit = "20" } = req.query;
        const take = Math.min(Number.parseInt(String(limit), 10) || 20, 100);
        const pageNum = Math.max(Number.parseInt(String(page), 10) || 1, 1);
        const skip = (pageNum - 1) * take;
        const where = {};
        if (q) {
            where.OR = [
                { title: { contains: q, mode: "insensitive" } },
                { description: { contains: q, mode: "insensitive" } },
                { location: { contains: q, mode: "insensitive" } },
                { employer: { is: { displayName: { contains: q, mode: "insensitive" } } } },
            ];
        }
        if (employerId)
            where.employerId = String(employerId);
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
            prisma_1.prisma.job.findMany({
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
            prisma_1.prisma.job.count({ where }),
        ]);
        res.json({ items, total, page: pageNum, limit: take });
    }
    catch (e) {
        console.error("[/api/admin/jobs] error:", e);
        res.status(500).json({ message: (e === null || e === void 0 ? void 0 : e.message) || "Failed to fetch jobs" });
    }
});
/** SOFT DELETE = set isActive=false */
router.delete("/:id", async (req, res) => {
    var _a, _b;
    try {
        const id = String(req.params.id);
        // cek eksistensi
        const job = await prisma_1.prisma.job.findUnique({ where: { id } });
        if (!job)
            return res.status(404).json({ message: "Job not found" });
        await prisma_1.prisma.job.update({ where: { id }, data: { isActive: false } });
        // audit log (opsional)
        console.info(`[ADMIN] user=${(_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : "unknown"} soft-deleted job=${id}`);
        res.status(204).end();
    }
    catch (e) {
        console.error("[soft delete] error:", e);
        res.status(500).json({ message: (e === null || e === void 0 ? void 0 : e.message) || "Soft delete failed" });
    }
});
/** HARD DELETE = hapus permanen */
router.delete("/:id/hard", async (req, res) => {
    var _a, _b;
    try {
        const id = String(req.params.id);
        const job = await prisma_1.prisma.job.findUnique({ where: { id } });
        if (!job)
            return res.status(404).json({ message: "Job not found" });
        await prisma_1.prisma.$transaction(async (tx) => {
            // Hapus child jika perlu
            // await tx.application.deleteMany({ where: { jobId: id } });
            // await tx.savedJob.deleteMany({ where: { jobId: id } });
            // await tx.jobReport.deleteMany({ where: { jobId: id } });
            await tx.job.delete({ where: { id } });
        });
        console.info(`[ADMIN] user=${(_b = (_a = req.user) === null || _a === void 0 ? void 0 : _a.userId) !== null && _b !== void 0 ? _b : "unknown"} hard-deleted job=${id}`);
        res.status(204).end();
    }
    catch (e) {
        console.error("[hard delete] error:", e);
        res.status(400).json({ message: (e === null || e === void 0 ? void 0 : e.message) || "Hard delete failed" });
    }
});
exports.default = router;
