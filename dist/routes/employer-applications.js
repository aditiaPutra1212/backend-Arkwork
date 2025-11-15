"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/employer-applications.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const employer_session_1 = require("../middleware/employer-session");
const router = (0, express_1.Router)();
/**
 * GET /api/employers/applications?jobId=<optional>&page=1&pageSize=20
 * employerId diambil dari cookie session (withEmployerSession)
 */
router.get('/', employer_session_1.withEmployerSession, async (req, res) => {
    try {
        const employerId = req.employerId;
        if (!employerId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const jobId = req.query.jobId || undefined;
        // pagination
        const page = Math.max(1, Number(req.query.page || 1));
        const pageSize = Math.min(100, Math.max(1, Number(req.query.pageSize || 20)));
        const skip = (page - 1) * pageSize;
        const take = pageSize;
        // validasi UUID sederhana untuk jobId (opsional)
        const isUuid = (s) => !!s && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(s);
        if (jobId && !isUuid(jobId)) {
            return res.status(400).json({ ok: false, error: 'jobId harus UUID' });
        }
        // WHERE filter: aplikasi untuk job yang dimiliki employer yang login
        const where = {
            job: { employerId, ...(jobId ? { id: jobId } : {}) },
        };
        // Ambil rows + relasi kandidat & job
        const apps = await prisma_1.prisma.jobApplication.findMany({
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
        const rows = apps.map((a) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
            return ({
                id: a.id,
                candidateName: (_b = (_a = a.applicant) === null || _a === void 0 ? void 0 : _a.name) !== null && _b !== void 0 ? _b : '-',
                candidateEmail: (_d = (_c = a.applicant) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : null,
                jobTitle: (_f = (_e = a.job) === null || _e === void 0 ? void 0 : _e.title) !== null && _f !== void 0 ? _f : (((_g = a.job) === null || _g === void 0 ? void 0 : _g.id) ? `Job ${a.job.id}` : 'Job'),
                status: a.status,
                createdAt: (_k = (_j = (_h = a.createdAt) === null || _h === void 0 ? void 0 : _h.toISOString) === null || _j === void 0 ? void 0 : _j.call(_h)) !== null && _k !== void 0 ? _k : null,
                cv: a.cvUrl
                    ? {
                        url: a.cvUrl,
                        name: a.cvFileName,
                        type: a.cvFileType,
                        size: a.cvFileSize,
                    }
                    : null,
            });
        });
        // Counters per status
        const grouped = await prisma_1.prisma.jobApplication.groupBy({
            by: ['status'],
            where,
            _count: { _all: true },
        });
        const counters = {
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
    }
    catch (e) {
        console.error('[GET /api/employers/applications] error:', e);
        return res.status(500).json({ ok: false, error: (e === null || e === void 0 ? void 0 : e.message) || 'Internal error' });
    }
});
/**
 * PATCH /api/employers/applications/:id
 * Body: { status: 'submitted' | 'review' | 'shortlist' | 'rejected' | 'hired' }
 * Hanya boleh untuk aplikasi yang job-nya milik employer yang login.
 */
router.patch('/:id', employer_session_1.withEmployerSession, async (req, res) => {
    var _a;
    try {
        const employerId = req.employerId;
        if (!employerId) {
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        }
        const id = req.params.id;
        const statusRaw = (((_a = req.body) === null || _a === void 0 ? void 0 : _a.status) || '').toString().toLowerCase();
        const allowed = ['submitted', 'review', 'shortlist', 'rejected', 'hired'];
        if (!allowed.includes(statusRaw)) {
            return res.status(400).json({ ok: false, error: 'Invalid status' });
        }
        // Pastikan aplikasi milik job yang employerId-nya = employer yang login
        const app = await prisma_1.prisma.jobApplication.findUnique({
            where: { id },
            select: { id: true, job: { select: { employerId: true } } },
        });
        if (!app || app.job.employerId !== employerId) {
            return res.status(404).json({ ok: false, error: 'Application not found' });
        }
        const updated = await prisma_1.prisma.jobApplication.update({
            where: { id },
            data: { status: statusRaw },
            select: { id: true, status: true, updatedAt: true },
        });
        return res.json({ ok: true, data: updated });
    }
    catch (e) {
        console.error('[PATCH /api/employers/applications/:id] error:', e);
        return res.status(500).json({ ok: false, error: (e === null || e === void 0 ? void 0 : e.message) || 'Internal error' });
    }
});
exports.default = router;
