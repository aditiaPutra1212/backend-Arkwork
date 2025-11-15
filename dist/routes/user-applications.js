"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const user_session_1 = require("../middleware/user-session");
const router = (0, express_1.Router)();
/**
 * GET /api/users/applications
 * Return list lamaran milik user saat ini
 */
router.get('/users/applications', user_session_1.withUserSession, async (req, res) => {
    try {
        const userId = req.userId;
        const apps = await prisma_1.prisma.jobApplication.findMany({
            where: { applicantId: userId },
            orderBy: { createdAt: 'desc' },
            select: {
                jobId: true,
                status: true,
                createdAt: true,
                job: { select: { title: true, location: true } },
            },
        });
        const rows = apps.map((a) => {
            var _a, _b, _c, _d;
            return ({
                jobId: a.jobId,
                title: (_b = (_a = a.job) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : `Job ${a.jobId}`,
                location: (_d = (_c = a.job) === null || _c === void 0 ? void 0 : _c.location) !== null && _d !== void 0 ? _d : '-',
                appliedAt: a.createdAt, // FE kita map ke appliedAt
                status: a.status, // enum ApplicationStatus
            });
        });
        res.json({ ok: true, rows });
    }
    catch (e) {
        res.status(500).json({ ok: false, error: (e === null || e === void 0 ? void 0 : e.message) || 'Internal error' });
    }
});
exports.default = router;
