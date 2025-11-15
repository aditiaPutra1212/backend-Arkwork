"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const node_crypto_1 = __importDefault(require("node:crypto"));
const multer_1 = __importDefault(require("multer"));
const prisma_1 = require("../lib/prisma");
const role_1 = require("../middleware/role");
const router = (0, express_1.Router)();
/* ========= Upload CV (PDF) ========= */
const UP_DIR = node_path_1.default.join(process.cwd(), 'public', 'uploads', 'cv');
node_fs_1.default.mkdirSync(UP_DIR, { recursive: true });
const upload = (0, multer_1.default)({
    storage: multer_1.default.diskStorage({
        destination: (_req, _file, cb) => cb(null, UP_DIR),
        filename: (_req, file, cb) => {
            const ext = '.pdf';
            const rand = node_crypto_1.default.randomBytes(8).toString('hex');
            cb(null, `${Date.now()}_${rand}${ext}`);
        },
    }),
    fileFilter: (_req, file, cb) => {
        const isPdf = file.mimetype === 'application/pdf' ||
            (file.originalname || '').toLowerCase().endsWith('.pdf');
        if (!isPdf)
            return cb(new multer_1.default.MulterError('LIMIT_UNEXPECTED_FILE', 'ONLY_PDF'));
        cb(null, true);
    },
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
});
/**
 * GET /api/users/applications  (list aplikasi user login)
 */
router.get('/users/applications', role_1.authRequired, async (req, res) => {
    try {
        const auth = req.auth;
        const userId = auth === null || auth === void 0 ? void 0 : auth.uid;
        if (!userId)
            return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
        const apps = await prisma_1.prisma.jobApplication.findMany({
            where: { applicantId: userId },
            orderBy: { createdAt: 'desc' },
            include: {
                job: {
                    select: {
                        id: true,
                        title: true,
                        location: true, // Field ini ADA di schema kamu
                        employment: true, // Field ini ADA di schema kamu
                        employer: { select: { displayName: true } },
                    },
                },
            },
        });
        const rows = apps.map((a) => {
            var _a, _b, _c, _d, _e, _f, _g, _h, _j;
            return ({
                id: a.id,
                jobId: a.jobId,
                title: (_b = (_a = a.job) === null || _a === void 0 ? void 0 : _a.title) !== null && _b !== void 0 ? _b : `Job ${a.jobId}`,
                location: (_d = (_c = a.job) === null || _c === void 0 ? void 0 : _c.location) !== null && _d !== void 0 ? _d : '-',
                employment: (_f = (_e = a.job) === null || _e === void 0 ? void 0 : _e.employment) !== null && _f !== void 0 ? _f : '-',
                company: (_j = (_h = (_g = a.job) === null || _g === void 0 ? void 0 : _g.employer) === null || _h === void 0 ? void 0 : _h.displayName) !== null && _j !== void 0 ? _j : 'Company',
                appliedAt: a.createdAt,
                status: a.status,
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
        return res.json({ ok: true, rows });
    }
    catch (e) {
        console.error('[GET /api/users/applications] error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
});
/**
 * POST /api/applications   ← penting: path disamakan agar tidak 404
 * Form-Data:
 *   - jobId: string
 *   - cv: (file pdf) opsional
 */
router.post('/applications', role_1.authRequired, upload.single('cv'), async (req, res) => {
    var _a;
    try {
        const jobId = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.jobId) || '').trim();
        if (!jobId) {
            if (req.file)
                try {
                    node_fs_1.default.unlinkSync(req.file.path);
                }
                catch { }
            return res.status(400).json({ ok: false, error: 'jobId required' });
        }
        const user = req.auth;
        const userId = user === null || user === void 0 ? void 0 : user.uid;
        if (!userId) {
            if (req.file)
                try {
                    node_fs_1.default.unlinkSync(req.file.path);
                }
                catch { }
            return res.status(401).json({ ok: false, error: 'UNAUTHENTICATED' });
        }
        const job = await prisma_1.prisma.job.findUnique({
            where: { id: jobId },
            select: { id: true, isActive: true, isHidden: true, title: true },
        });
        if (!job || !job.isActive || job.isHidden) {
            if (req.file)
                try {
                    node_fs_1.default.unlinkSync(req.file.path);
                }
                catch { }
            return res.status(404).json({ ok: false, error: 'Job not found/active' });
        }
        // Infos CV (jika ada)
        let cv = null;
        if (req.file) {
            cv = {
                url: `/uploads/cv/${req.file.filename}`,
                name: req.file.originalname || req.file.filename,
                type: req.file.mimetype || 'application/pdf',
                size: req.file.size,
            };
        }
        const result = await prisma_1.prisma.jobApplication.upsert({
            where: { jobId_applicantId: { jobId, applicantId: userId } },
            create: {
                jobId,
                applicantId: userId,
                ...(cv ? {
                    cvUrl: cv.url,
                    cvFileName: cv.name,
                    cvFileType: cv.type,
                    cvFileSize: cv.size,
                } : {}),
            },
            update: {
                ...(cv ? {
                    cvUrl: cv.url,
                    cvFileName: cv.name,
                    cvFileType: cv.type,
                    cvFileSize: cv.size,
                } : {}),
                updatedAt: new Date(),
            },
            include: { job: { select: { id: true, title: true } } },
        });
        return res.json({
            ok: true,
            data: {
                id: result.id,
                jobId: result.job.id,
                jobTitle: result.job.title,
                status: result.status,
                createdAt: result.createdAt,
                cv: result.cvUrl
                    ? {
                        url: result.cvUrl,
                        name: result.cvFileName,
                        type: result.cvFileType,
                        size: result.cvFileSize,
                    }
                    : null,
            },
        });
    }
    catch (e) {
        if (e instanceof multer_1.default.MulterError) {
            if (e.code === 'LIMIT_FILE_SIZE') {
                return res.status(413).json({ ok: false, error: 'CV terlalu besar. Maks 2 MB.' });
            }
            return res.status(400).json({ ok: false, error: 'Upload CV gagal. Pastikan file PDF.' });
        }
        if ((e === null || e === void 0 ? void 0 : e.code) === 'P2002') {
            // unique constraint (jobId, applicantId)
            return res.status(409).json({ ok: false, error: 'Anda sudah melamar job ini' });
        }
        console.error('[POST /api/applications] error:', e);
        return res.status(500).json({ ok: false, error: 'SERVER_ERROR' });
    }
});
exports.default = router;
