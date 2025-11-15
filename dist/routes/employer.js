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
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const prisma_1 = require("../lib/prisma");
// ⬇️ gunakan service billing agar email terkirim
const billing_1 = require("../services/billing");
exports.employerRouter = (0, express_1.Router)();
/* ================== AUTH ================== */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const EMP_SESSION_COOKIE = 'emp_session';
const EMP_TOKEN_COOKIE = 'emp_token';
async function authFromSession(req) {
    const sid = (0, cookie_1.parse)(req.headers.cookie || '')[EMP_SESSION_COOKIE];
    if (!sid)
        return null;
    const s = await prisma_1.prisma.session.findUnique({
        where: { id: sid },
        select: { id: true, employerId: true, revokedAt: true, expiresAt: true },
    });
    const now = new Date();
    if (!s || !s.employerId || s.revokedAt || (s.expiresAt && s.expiresAt < now))
        return null;
    return { employerId: s.employerId, sessionId: s.id };
}
function authFromToken(req) {
    const token = (0, cookie_1.parse)(req.headers.cookie || '')[EMP_TOKEN_COOKIE];
    if (!token)
        return null;
    try {
        const p = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (p.role !== 'employer' || !p.eid)
            return null;
        return { employerId: p.eid, adminUserId: p.uid };
    }
    catch {
        return null;
    }
}
async function resolveEmployerAuth(req) {
    var _a, _b, _c, _d;
    const bySess = await authFromSession(req);
    if (bySess) {
        return {
            employerId: bySess.employerId,
            sessionId: bySess.sessionId,
            adminUserId: null,
        };
    }
    const byJwt = authFromToken(req);
    if (byJwt) {
        return {
            employerId: byJwt.employerId,
            sessionId: null,
            adminUserId: (_a = byJwt.adminUserId) !== null && _a !== void 0 ? _a : null,
        };
    }
    const header = ((_b = req.headers['x-employer-id']) === null || _b === void 0 ? void 0 : _b.trim()) || null;
    const query = ((_d = (_c = req.query) === null || _c === void 0 ? void 0 : _c.employerId) === null || _d === void 0 ? void 0 : _d.trim()) || null;
    const env = process.env.DEV_EMPLOYER_ID || null;
    const employerId = header || query || env;
    if (!employerId)
        return null;
    return { employerId, sessionId: null, adminUserId: null };
}
async function attachEmployerId(req, _res, next) {
    var _a, _b, _c;
    try {
        const auth = await resolveEmployerAuth(req);
        req.employerId = (_a = auth === null || auth === void 0 ? void 0 : auth.employerId) !== null && _a !== void 0 ? _a : null;
        req.employerSessionId = (_b = auth === null || auth === void 0 ? void 0 : auth.sessionId) !== null && _b !== void 0 ? _b : null;
        req.employerAdminUserId = (_c = auth === null || auth === void 0 ? void 0 : auth.adminUserId) !== null && _c !== void 0 ? _c : null;
    }
    catch {
        req.employerId = null;
        req.employerSessionId = null;
        req.employerAdminUserId = null;
    }
    next();
}
/* ================== Small utils ================== */
function slugify(s) {
    return (s || '')
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '')
        .slice(0, 60);
}
async function uniqueSlug(base) {
    let s = slugify(base) || 'company';
    let i = 1;
    while (await prisma_1.prisma.employer.findUnique({ where: { slug: s } })) {
        s = `${slugify(base)}-${i++}`;
    }
    return s;
}
/* ================== /auth/me & /me ================== */
async function handleMe(req, res) {
    var _a;
    const auth = await resolveEmployerAuth(req);
    if (!(auth === null || auth === void 0 ? void 0 : auth.employerId)) {
        return res.status(401).json({ ok: false, message: 'Unauthorized' });
    }
    const employer = await prisma_1.prisma.employer.findUnique({
        where: { id: auth.employerId },
        select: { id: true, slug: true, displayName: true, legalName: true, website: true },
    });
    if (!employer) {
        return res.status(404).json({ ok: false, message: 'Employer not found' });
    }
    const adminUserId = auth.adminUserId;
    const admin = adminUserId
        ? await prisma_1.prisma.employerAdminUser
            .findUnique({
            where: { id: adminUserId },
            select: { id: true, email: true, fullName: true, isOwner: true },
        })
            .catch(() => null)
        : null;
    const fallbackName = employer.displayName ||
        (admin === null || admin === void 0 ? void 0 : admin.fullName) ||
        employer.legalName ||
        'Company';
    return res.json({
        ok: true,
        role: 'employer',
        employer: {
            id: employer.id,
            slug: employer.slug,
            displayName: (_a = employer.displayName) !== null && _a !== void 0 ? _a : fallbackName,
            legalName: employer.legalName,
            website: employer.website,
        },
        admin: admin
            ? { id: admin.id, email: admin.email, fullName: admin.fullName, isOwner: admin.isOwner }
            : null,
        sessionId: auth.sessionId,
    });
}
exports.employerRouter.get('/auth/me', handleMe);
exports.employerRouter.get('/me', handleMe);
/* ================== STEP 1: buat akun employer + admin owner ================== */
exports.employerRouter.post('/step1', async (req, res) => {
    try {
        const { companyName, displayName, email, password, confirmPassword, website, agree, } = req.body || {};
        if (!companyName || !email || !password || !confirmPassword) {
            return res.status(400).json({ error: 'Missing required fields' });
        }
        if (password !== confirmPassword) {
            return res.status(400).json({ error: 'Password mismatch' });
        }
        if (agree !== true) {
            return res.status(400).json({ error: 'You must agree to the Terms' });
        }
        const slug = await uniqueSlug(displayName || companyName);
        const hash = await bcryptjs_1.default.hash(password, 10);
        const employer = await prisma_1.prisma.employer.create({
            data: {
                slug,
                legalName: companyName,
                displayName: displayName || companyName,
                website: website || null,
                admins: {
                    create: {
                        email,
                        passwordHash: hash,
                        isOwner: true,
                    },
                },
                profile: { create: {} },
            },
            include: { admins: true },
        });
        return res.json({ ok: true, employerId: employer.id, slug: employer.slug });
    }
    catch (e) {
        if ((e === null || e === void 0 ? void 0 : e.code) === 'P2002') {
            return res.status(409).json({ error: 'Email or slug already exists' });
        }
        console.error('step1 error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
/* ================== STEP 2: update profil ================== */
exports.employerRouter.post('/step2', async (req, res) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k, _l, _m, _o, _p, _q, _r;
    try {
        const { employerId, ...profile } = req.body || {};
        if (!employerId)
            return res.status(400).json({ error: 'employerId required' });
        await prisma_1.prisma.employerProfile.upsert({
            where: { employerId },
            update: {
                industry: (_a = profile.industry) !== null && _a !== void 0 ? _a : undefined,
                size: (_b = profile.size) !== null && _b !== void 0 ? _b : undefined,
                foundedYear: (_c = profile.foundedYear) !== null && _c !== void 0 ? _c : undefined,
                about: (_d = profile.about) !== null && _d !== void 0 ? _d : undefined,
                hqCity: (_e = profile.hqCity) !== null && _e !== void 0 ? _e : undefined,
                hqCountry: (_f = profile.hqCountry) !== null && _f !== void 0 ? _f : undefined,
                logoUrl: (_g = profile.logoUrl) !== null && _g !== void 0 ? _g : undefined,
                bannerUrl: (_h = profile.bannerUrl) !== null && _h !== void 0 ? _h : undefined,
            },
            create: {
                employerId,
                industry: (_j = profile.industry) !== null && _j !== void 0 ? _j : null,
                size: (_k = profile.size) !== null && _k !== void 0 ? _k : null,
                foundedYear: (_l = profile.foundedYear) !== null && _l !== void 0 ? _l : null,
                about: (_m = profile.about) !== null && _m !== void 0 ? _m : null,
                hqCity: (_o = profile.hqCity) !== null && _o !== void 0 ? _o : null,
                hqCountry: (_p = profile.hqCountry) !== null && _p !== void 0 ? _p : null,
                logoUrl: (_q = profile.logoUrl) !== null && _q !== void 0 ? _q : null,
                bannerUrl: (_r = profile.bannerUrl) !== null && _r !== void 0 ? _r : null,
            },
        });
        await prisma_1.prisma.employer.update({
            where: { id: employerId },
            data: { onboardingStep: 'VERIFY' },
        });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('step2 error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
/* ================== STEP 3: pilih paket (trial/gratis/berbayar) ================== */
/**
 * Body: { employerId, planSlug }
 * Result:
 *  - { ok: true, mode: 'trial', trialEndsAt }
 *  - { ok: true, mode: 'free_active', premiumUntil }
 *  - { ok: true, mode: 'needs_payment' }
 */
exports.employerRouter.post('/step3', async (req, res) => {
    var _a, _b;
    try {
        const { employerId, planSlug } = req.body;
        if (!employerId || !planSlug)
            return res.status(400).json({ error: 'employerId & planSlug required' });
        const employer = await prisma_1.prisma.employer.findUnique({ where: { id: employerId } });
        if (!employer)
            return res.status(404).json({ error: 'Employer not found' });
        const plan = await prisma_1.prisma.plan.findUnique({ where: { slug: planSlug } });
        if (!plan || !plan.active)
            return res.status(400).json({ error: 'Plan not available' });
        // === TRIAL → gunakan service (email terkirim di dalamnya)
        if (((_a = plan.trialDays) !== null && _a !== void 0 ? _a : 0) > 0) {
            const { trialEndsAt } = await (0, billing_1.startTrial)({
                employerId,
                planId: plan.id,
                trialDays: plan.trialDays,
            });
            await prisma_1.prisma.employer.update({
                where: { id: employerId },
                data: { onboardingStep: 'VERIFY' },
            });
            return res.json({ ok: true, mode: 'trial', trialEndsAt: trialEndsAt.toISOString() });
        }
        const amount = Number((_b = plan.amount) !== null && _b !== void 0 ? _b : 0);
        // === GRATIS → aktifkan premium via service (email terkirim di dalamnya)
        if (amount === 0) {
            const { premiumUntil } = await (0, billing_1.activatePremium)({
                employerId,
                planId: plan.id,
                interval: plan.interval || 'month',
            });
            await prisma_1.prisma.employer.update({
                where: { id: employerId },
                data: { onboardingStep: 'VERIFY' },
            });
            return res.json({ ok: true, mode: 'free_active', premiumUntil: premiumUntil.toISOString() });
        }
        // === BERBAYAR & tanpa trial → perlu checkout (email akan dikirim via webhook Midtrans setelah sukses)
        await prisma_1.prisma.employer.update({
            where: { id: employerId },
            data: { currentPlanId: plan.id, onboardingStep: 'VERIFY' },
        });
        return res.json({ ok: true, mode: 'needs_payment' });
    }
    catch (e) {
        console.error('step3 error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
/* ================== STEP 5: submit verifikasi ================== */
exports.employerRouter.post('/step5', async (req, res) => {
    try {
        const { employerId, note } = req.body || {};
        if (!employerId)
            return res.status(400).json({ error: 'employerId required' });
        await prisma_1.prisma.verificationRequest.create({
            data: {
                employerId,
                status: 'pending',
                note: note !== null && note !== void 0 ? note : null,
            },
        });
        return res.json({ ok: true });
    }
    catch (e) {
        console.error('step5 error', e);
        return res.status(500).json({ error: 'Internal error' });
    }
});
/* ================== Upload logo ================== */
const uploadsRoot = node_path_1.default.join(process.cwd(), 'public', 'uploads');
node_fs_1.default.mkdirSync(uploadsRoot, { recursive: true });
function pickEmployerIdForStorage(req) {
    var _a, _b;
    const byAttach = req.employerId || undefined;
    const byHeader = (_a = req.headers['x-employer-id']) === null || _a === void 0 ? void 0 : _a.trim();
    const byToken = (_b = authFromToken(req)) === null || _b === void 0 ? void 0 : _b.employerId;
    return byAttach || byHeader || byToken || 'unknown';
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
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (_req, file, cb) => {
        if (!/^image\/(png|jpe?g|webp)$/i.test(file.mimetype)) {
            return cb(new Error('Only PNG/JPG/WebP allowed'));
        }
        cb(null, true);
    },
});
exports.employerRouter.post('/profile/logo', upload.single('file'), async (req, res) => {
    var _a;
    const mreq = req;
    const auth = await resolveEmployerAuth(req);
    const employerId = req.employerId ||
        ((_a = mreq.body) === null || _a === void 0 ? void 0 : _a.employerId) ||
        (auth === null || auth === void 0 ? void 0 : auth.employerId) ||
        null;
    if (!employerId)
        return res.status(400).json({ message: 'employerId required' });
    if (!mreq.file)
        return res.status(400).json({ message: 'file required' });
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
exports.default = exports.employerRouter;
