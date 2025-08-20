"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.employerRouter = void 0;
// src/routes/employer.ts
const express_1 = require("express");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = require("cookie");
const employer_1 = require("../validators/employer");
const employer_2 = require("../services/employer");
const prisma_1 = require("../lib/prisma");
exports.employerRouter = (0, express_1.Router)();
/* ================== AUTH HELPERS (selaras dgn routes/auth.ts) ================== */
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function getAuth(req) {
    const raw = req.headers.cookie || '';
    const cookies = (0, cookie_1.parse)(raw);
    const token = cookies['token'];
    if (!token)
        return null;
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return { userId: payload.uid, employerId: payload.eid ?? null };
    }
    catch {
        return null;
    }
}
/* ================== ALUR 5 STEP SIGNUP EMPLOYER ================== */
// GET /api/employers/availability?slug=...&email=...
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
// POST /api/employers/step1
// membuat akun employer + (opsional) user owner (bergantung implementasi kamu di services)
exports.employerRouter.post('/step1', async (req, res, next) => {
    try {
        const parsed = employer_1.Step1Schema.parse(req.body);
        const result = await (0, employer_2.createAccount)(parsed);
        // TIDAK auto-login → user akan sign-in di akhir onboarding
        res.json({
            ok: true,
            ...result, // { employerId, employerSlug, userId? }
            next: '/api/employers/step2',
        });
    }
    catch (e) {
        if (e?.code === 'P2002')
            return res.status(409).json({ error: 'Email already used' });
        if (e?.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
// POST /api/employers/step2 (lengkapi profil perusahaan)
exports.employerRouter.post('/step2', async (req, res, next) => {
    try {
        const parsed = employer_1.Step2Schema.parse(req.body);
        const { employerId, ...profile } = parsed;
        const data = await (0, employer_2.upsertProfile)(employerId, profile);
        res.json({ ok: true, data, next: '/api/employers/step3' });
    }
    catch (e) {
        if (e?.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
// POST /api/employers/step3 (pilih paket)
exports.employerRouter.post('/step3', async (req, res, next) => {
    try {
        const parsed = employer_1.Step3Schema.parse(req.body);
        const data = await (0, employer_2.choosePlan)(parsed.employerId, parsed.planSlug);
        res.json({ ok: true, data, next: '/api/employers/step4' });
    }
    catch (e) {
        if (e?.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
// POST /api/employers/step4 (buat draft job)
exports.employerRouter.post('/step4', async (req, res, next) => {
    try {
        const parsed = employer_1.Step4Schema.parse(req.body);
        const { employerId, ...rest } = parsed;
        const data = await (0, employer_2.createDraftJob)(employerId, rest);
        res.json({ ok: true, data, next: '/api/employers/step5' });
    }
    catch (e) {
        if (e?.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
// POST /api/employers/step5 (submit verifikasi)
// Setelah verifikasi tersubmit, arahkan FE untuk menampilkan CTA "Sign in"
exports.employerRouter.post('/step5', async (req, res, next) => {
    try {
        const parsed = employer_1.Step5Schema.parse(req.body);
        const data = await (0, employer_2.submitVerification)(parsed.employerId, parsed.note, parsed.files);
        // Ambil slug utk query di /auth/signin (opsional)
        let slug = null;
        try {
            const emp = await prisma_1.prisma.employer.findUnique({
                where: { id: parsed.employerId },
                select: { slug: true },
            });
            slug = emp?.slug ?? null;
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
        if (e?.issues)
            return res.status(400).json({ error: 'Validation error', details: e.issues });
        next(e);
    }
});
/* ================== ENDPOINT SESI EMPLOYER (untuk Nav/FE) ================== */
// GET /api/employers/me
// Membaca cookie JWT (dibuat oleh /auth/signin) dan mengembalikan employer aktif
exports.employerRouter.get('/me', async (req, res) => {
    const auth = getAuth(req);
    if (!auth)
        return res.status(401).json({ message: 'Unauthorized' });
    let employer = null;
    // jika ada employerId di token (eid), pakai itu
    if (auth.employerId) {
        employer = await prisma_1.prisma.employer.findUnique({
            where: { id: auth.employerId },
            select: { id: true, slug: true, displayName: true, legalName: true },
        });
    }
    // fallback tanpa ownerId: ambil employer pertama (urut terbaru)
    if (!employer) {
        employer = await prisma_1.prisma.employer.findFirst({
            select: { id: true, slug: true, displayName: true, legalName: true },
            // kalau schema tidak punya createdAt, hapus baris di bawah ini
            orderBy: { createdAt: 'desc' },
        });
    }
    return res.json({ employer });
});
/* ================== (OPSIONAL) RINGKASAN / LISTING ==================
   Endpoint berikut cocok dengan FE contoh. Silakan ganti query-nya
   ke prisma model kamu yang sebenarnya atau hapus bila tak dibutuhkan.
===================================================================== */
// GET /api/employers/stats
exports.employerRouter.get('/stats', async (req, res) => {
    const auth = getAuth(req);
    if (!auth)
        return res.status(401).json({ message: 'Unauthorized' });
    // contoh dummy; ganti dengan query real
    res.json({
        activeJobs: 0,
        totalApplicants: 0,
        interviews: 0,
        views: 0,
        lastUpdated: new Date().toISOString(),
    });
});
// GET /api/employers/jobs
exports.employerRouter.get('/jobs', async (req, res) => {
    const auth = getAuth(req);
    if (!auth)
        return res.status(401).json({ message: 'Unauthorized' });
    // contoh dummy; ganti dengan query real dari prisma.job
    res.json([]);
});
// GET /api/employers/applications
exports.employerRouter.get('/applications', async (req, res) => {
    const auth = getAuth(req);
    if (!auth)
        return res.status(401).json({ message: 'Unauthorized' });
    // contoh dummy; ganti dengan query real dari prisma.application
    res.json([]);
});
exports.default = exports.employerRouter;
