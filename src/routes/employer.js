"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.employerRouter = void 0;
exports.attachEmployerId = attachEmployerId;
// src/routes/employer.ts
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = require("cookie");
const node_path_1 = __importDefault(require("node:path"));
const node_fs_1 = __importDefault(require("node:fs"));
const multer_1 = __importDefault(require("multer"));
const employer_1 = require("../validators/employer");
const employer_2 = require("../services/employer");
const prisma_1 = require("../lib/prisma");
exports.employerRouter = (0, express_1.Router)();
/* ================== AUTH HELPERS (pakai emp_token) ================== */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function getEmployerAuth(req) {
    const raw = req.headers.cookie || '';
    const cookies = (0, cookie_1.parse)(raw);
    const token = cookies['emp_token'];
    if (!token)
        return null;
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (payload.role !== 'employer' || !payload.eid)
            return null;
        return { adminUserId: payload.uid, employerId: payload.eid };
    }
    catch {
        return null;
    }
}
/* ================== MIDDLEWARE attachEmployerId ================== */
function attachEmployerId(req, _res, next) {
    var _a, _b, _c, _d, _e;
    const fromSession = (_a = req === null || req === void 0 ? void 0 : req.session) === null || _a === void 0 ? void 0 : _a.employerId;
    const fromHeader = (_b = req.headers['x-employer-id']) === null || _b === void 0 ? void 0 : _b.trim();
    const fromQuery = (_d = (_c = req.query) === null || _c === void 0 ? void 0 : _c.employerId) === null || _d === void 0 ? void 0 : _d.trim();
    const fromEnv = process.env.DEV_EMPLOYER_ID;
    // dari cookie emp_token
    const fromCookie = (_e = getEmployerAuth(req)) === null || _e === void 0 ? void 0 : _e.employerId;
    req.employerId =
        fromSession ||
            fromHeader ||
            fromQuery ||
            fromCookie ||
            fromEnv ||
            null;
    next();
}
/* ================== MULTER (upload logo) ================== */
// file statis dilayani oleh index.ts: app.use('/uploads', express.static('public/uploads'))
const uploadsRoot = node_path_1.default.join(process.cwd(), 'public', 'uploads');
node_fs_1.default.mkdirSync(uploadsRoot, { recursive: true });
function pickEmployerIdForStorage(req) {
    var _a, _b;
    const fromAttach = req.employerId || undefined;
    const fromHeader = (_a = req.headers['x-employer-id']) === null || _a === void 0 ? void 0 : _a.trim();
    const fromCookie = (_b = getEmployerAuth(req)) === null || _b === void 0 ? void 0 : _b.employerId;
    return fromAttach || fromHeader || fromCookie || 'unknown';
}
const storage = multer_1.default.diskStorage({
    destination: (req, _file, cb) => {
        const eid = pickEmployerIdForStorage(req);
        const dir = node_path_1.default.join(uploadsRoot, 'employers', eid);
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        cb(null, dir);
    },
    filename: (_req, file, cb) => {
        const ext = (node_path_1.default.extname(file.originalname) || '.jpg').toLowerCase();
        cb(null, 'logo' + ext);
    },
});
const upload = (0, multer_1.default)({
    storage,
    limits: { fileSize: 2 * 1024 * 1024 }, // 2MB
    fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
            return cb(new Error('Only PNG/JPG/WebP allowed'));
        }
        cb(null, true);
    },
});
/* ================== ROUTES ================== */
// gunakan attachEmployerId untuk semua route yang butuh employerId
exports.employerRouter.use(attachEmployerId);
/* --------- STEP SIGNUP 1-5 --------- */
exports.employerRouter.get('/availability', async (req, res, next) => {
    try {
        const data = await (0, employer_2.checkAvailability)({
            slug: req.query.slug || '',
            email: req.query.email || '',
        });
        res.json(data);
    }
    catch (e) {
        next(e);
    }
});
exports.employerRouter.post('/step1', async (req, res, next) => {
    try {
        const parsed = employer_1.Step1Schema.parse(req.body);
        const result = await (0, employer_2.createAccount)(parsed);
        res.json({ ok: true, ...result, next: '/api/employers/step2' });
    }
    catch (e) {
        if ((e === null || e === void 0 ? void 0 : e.code) === 'P2002')
            return res.status(409).json({ error: 'Email already used' });
        if (e === null || e === void 0 ? void 0 : e.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
exports.employerRouter.post('/step2', async (req, res, next) => {
    try {
        const parsed = employer_1.Step2Schema.parse(req.body);
        const { employerId, ...profile } = parsed;
        const data = await (0, employer_2.upsertProfile)(employerId, profile);
        res.json({ ok: true, data, next: '/api/employers/step3' });
    }
    catch (e) {
        if (e === null || e === void 0 ? void 0 : e.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
exports.employerRouter.post('/step3', async (req, res, next) => {
    try {
        const parsed = employer_1.Step3Schema.parse(req.body);
        const data = await (0, employer_2.choosePlan)(parsed.employerId, parsed.planSlug);
        res.json({ ok: true, data, next: '/api/employers/step4' });
    }
    catch (e) {
        if (e === null || e === void 0 ? void 0 : e.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
exports.employerRouter.post('/step4', async (req, res, next) => {
    try {
        const parsed = employer_1.Step4Schema.parse(req.body);
        const { employerId, ...rest } = parsed;
        const data = await (0, employer_2.createDraftJob)(employerId, rest);
        res.json({ ok: true, data, next: '/api/employers/step5' });
    }
    catch (e) {
        if (e === null || e === void 0 ? void 0 : e.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
exports.employerRouter.post('/step5', async (req, res, next) => {
    var _a;
    try {
        const parsed = employer_1.Step5Schema.parse(req.body);
        const data = await (0, employer_2.submitVerification)(parsed.employerId, parsed.note, parsed.files);
        let slug = null;
        try {
            const emp = await prisma_1.prisma.employer.findUnique({
                where: { id: parsed.employerId },
                select: { slug: true },
            });
            slug = (_a = emp === null || emp === void 0 ? void 0 : emp.slug) !== null && _a !== void 0 ? _a : null;
        }
        catch {
            slug = null;
        }
        res.json({
            ok: true,
            data,
            onboarding: 'completed',
            message: 'Verifikasi terkirim. Silakan sign in untuk melanjutkan.',
            signinRedirect: slug ? `/auth/signin?employerSlug=${encodeURIComponent(slug)}` : `/auth/signin`,
        });
    }
    catch (e) {
        if (e === null || e === void 0 ? void 0 : e.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
/* --------- EMPLOYER UTILITY --------- */
// ✅ Endpoint ini sekarang BALIKIN admin.email
exports.employerRouter.get('/me', async (req, res) => {
    var _a, _b, _c, _d;
    const auth = getEmployerAuth(req);
    if (!auth)
        return res.status(401).json({ message: 'Unauthorized' });
    const employer = await prisma_1.prisma.employer.findUnique({
        where: { id: auth.employerId },
        select: { id: true, slug: true, displayName: true, legalName: true, website: true },
    });
    if (!employer)
        return res.status(404).json({ message: 'Employer not found' });
    // ---- ambil email admin (GANTI nama model jika berbeda) ----
    const admin = await prisma_1.prisma.employerAdminUser.findUnique({
        where: { id: auth.adminUserId },
        select: { id: true, email: true, fullName: true, isOwner: true },
    }).catch(() => null);
    return res.json({
        ok: true,
        role: 'employer',
        employer,
        admin: {
            id: (_a = admin === null || admin === void 0 ? void 0 : admin.id) !== null && _a !== void 0 ? _a : auth.adminUserId,
            email: (_b = admin === null || admin === void 0 ? void 0 : admin.email) !== null && _b !== void 0 ? _b : null,
            fullName: (_c = admin === null || admin === void 0 ? void 0 : admin.fullName) !== null && _c !== void 0 ? _c : null,
            isOwner: (_d = admin === null || admin === void 0 ? void 0 : admin.isOwner) !== null && _d !== void 0 ? _d : undefined,
        },
    });
});
exports.employerRouter.get('/profile', async (req, res) => {
    var _a, _b;
    const employerId = req.employerId ||
        ((_a = getEmployerAuth(req)) === null || _a === void 0 ? void 0 : _a.employerId) ||
        ((_b = req.query) === null || _b === void 0 ? void 0 : _b.employerId);
    if (!employerId)
        return res.status(400).json({ message: 'employerId required' });
    const profile = await prisma_1.prisma.employerProfile.findUnique({
        where: { employerId },
        select: {
            about: true, hqCity: true, hqCountry: true, logoUrl: true, bannerUrl: true,
            linkedin: true, instagram: true, twitter: true, industry: true, size: true,
            foundedYear: true, updatedAt: true,
        },
    });
    return res.json(profile || {});
});
exports.employerRouter.post('/update-basic', async (req, res) => {
    var _a, _b;
    const employerId = req.employerId ||
        ((_a = getEmployerAuth(req)) === null || _a === void 0 ? void 0 : _a.employerId) ||
        ((_b = req.body) === null || _b === void 0 ? void 0 : _b.employerId);
    if (!employerId)
        return res.status(400).json({ message: 'employerId required' });
    const { displayName, legalName, website } = req.body || {};
    const data = {};
    if (typeof displayName === 'string')
        data.displayName = displayName.trim();
    if (typeof legalName === 'string')
        data.legalName = legalName.trim();
    if (typeof website === 'string' || website === null)
        data.website = website || null;
    if (!Object.keys(data).length)
        return res.json({ ok: true });
    const updated = await prisma_1.prisma.employer.update({
        where: { id: employerId },
        data,
        select: { id: true, displayName: true, legalName: true, website: true },
    });
    return res.json({ ok: true, employer: updated });
});
/* ------------------------- UPLOAD LOGO ------------------------- */
exports.employerRouter.post('/profile/logo', upload.single('file'), async (req, res) => {
    var _a, _b;
    const mreq = req;
    const employerId = req.employerId ||
        ((_a = mreq.body) === null || _a === void 0 ? void 0 : _a.employerId) ||
        ((_b = getEmployerAuth(req)) === null || _b === void 0 ? void 0 : _b.employerId) ||
        null;
    if (!employerId)
        return res.status(400).json({ message: 'employerId required' });
    if (!mreq.file)
        return res.status(400).json({ message: 'file required' });
    // (edge case) pastikan file ada di folder employerId
    const dir = node_path_1.default.join(uploadsRoot, 'employers', employerId);
    if (!node_fs_1.default.existsSync(dir)) {
        node_fs_1.default.mkdirSync(dir, { recursive: true });
        const from = node_path_1.default.join(uploadsRoot, 'employers', 'unknown', mreq.file.filename);
        const to = node_path_1.default.join(dir, mreq.file.filename);
        try {
            node_fs_1.default.renameSync(from, to);
        }
        catch { }
    }
    const publicUrl = `/uploads/employers/${employerId}/${mreq.file.filename}`;
    await prisma_1.prisma.employerProfile.upsert({
        where: { employerId },
        create: { employerId, logoUrl: publicUrl },
        update: { logoUrl: publicUrl },
    });
    return res.json({ ok: true, url: publicUrl });
});
/* --------- DUMMY ENDPOINTS --------- */
exports.employerRouter.get('/stats', async (req, res) => {
    var _a;
    const employerId = req.employerId || ((_a = getEmployerAuth(req)) === null || _a === void 0 ? void 0 : _a.employerId);
    if (!employerId)
        return res.status(401).json({ message: 'Unauthorized' });
    res.json({
        activeJobs: 0, totalApplicants: 0, interviews: 0, views: 0,
        lastUpdated: new Date().toISOString(),
    });
});
exports.employerRouter.get('/jobs', async (req, res) => {
    var _a;
    const employerId = req.employerId || ((_a = getEmployerAuth(req)) === null || _a === void 0 ? void 0 : _a.employerId);
    if (!employerId)
        return res.status(401).json({ message: 'Unauthorized' });
    res.json([]);
});
exports.employerRouter.get('/applications', async (req, res) => {
    var _a;
    const employerId = req.employerId || ((_a = getEmployerAuth(req)) === null || _a === void 0 ? void 0 : _a.employerId);
    if (!employerId)
        return res.status(401).json({ message: 'Unauthorized' });
    res.json([]);
});
exports.default = exports.employerRouter;
