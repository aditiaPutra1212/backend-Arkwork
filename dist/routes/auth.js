"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/auth.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = require("cookie");
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
function signToken(p) {
    return jsonwebtoken_1.default.sign(p, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(t) {
    return jsonwebtoken_1.default.verify(t, JWT_SECRET);
}
function setAuthCookie(res, token) {
    res.setHeader('Set-Cookie', (0, cookie_1.serialize)('token', token, {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 hari
    }));
}
/** ============== Helpers ============== **/
async function resolveEmployerBySlugOrLatest(opts) {
    const { employerSlug } = opts;
    // slug → employer
    if (employerSlug) {
        const bySlug = await prisma_1.prisma.employer.findUnique({
            where: { slug: employerSlug },
            select: { id: true, slug: true, displayName: true, legalName: true },
        });
        if (bySlug)
            return bySlug;
    }
    // fallback: employer terbaru
    const first = await prisma_1.prisma.employer.findFirst({
        orderBy: { createdAt: 'desc' },
        select: { id: true, slug: true, displayName: true, legalName: true },
    });
    return first || null;
}
/** ================= Validators ================= **/
const registerAdminSchema = zod_1.z.object({
    employerId: zod_1.z.string().min(1),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    fullName: zod_1.z.string().min(2).max(100).optional(),
});
const signinSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    employerSlug: zod_1.z.string().min(1).optional(), // opsional: pilih employer saat login
});
const switchEmployerSchema = zod_1.z.object({
    employerId: zod_1.z.string().min(1).optional(),
    employerSlug: zod_1.z.string().min(1).optional(),
});
/** ================= Routes ================= **/
// GET /auth
router.get('/', (_req, res) => {
    res.json({ message: 'Auth is alive' });
});
// POST /auth/register-admin  (buat akun EmployerAdminUser)
router.post('/register-admin', async (req, res) => {
    try {
        const parsed = registerAdminSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { employerId, email, password, fullName } = parsed.data;
        const employer = await prisma_1.prisma.employer.findUnique({ where: { id: employerId } });
        if (!employer)
            return res.status(404).json({ error: 'Employer not found' });
        const exist = await prisma_1.prisma.employerAdminUser.findUnique({ where: { email } });
        if (exist)
            return res.status(409).json({ error: 'Email already used' });
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const admin = await prisma_1.prisma.employerAdminUser.create({
            data: {
                employerId,
                email,
                passwordHash,
                fullName: fullName ?? null,
                isOwner: true,
                agreedTosAt: new Date(),
            },
            select: { id: true, email: true, employerId: true, fullName: true },
        });
        const token = signToken({ uid: admin.id, role: 'admin', eid: admin.employerId });
        setAuthCookie(res, token);
        return res.status(201).json({ ok: true, admin });
    }
    catch (e) {
        console.error('REGISTER-ADMIN ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// POST /auth/signin (login EmployerAdminUser)
router.post('/signin', async (req, res) => {
    try {
        const parsed = signinSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { email, password, employerSlug } = parsed.data;
        const admin = await prisma_1.prisma.employerAdminUser.findUnique({ where: { email } });
        if (!admin)
            return res.status(401).json({ message: 'Email atau password salah' });
        const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!ok)
            return res.status(401).json({ message: 'Email atau password salah' });
        // employer aktif: pakai slug bila ada, kalau tidak pakai employerId admin
        let employer = (await resolveEmployerBySlugOrLatest({ employerSlug })) ??
            (await prisma_1.prisma.employer.findUnique({
                where: { id: admin.employerId },
                select: { id: true, slug: true, displayName: true, legalName: true },
            }));
        const token = signToken({
            uid: admin.id,
            role: 'admin',
            eid: employer?.id ?? admin.employerId ?? null,
        });
        setAuthCookie(res, token);
        return res.json({
            ok: true,
            admin: {
                id: admin.id,
                email: admin.email,
                fullName: admin.fullName ?? null,
                employerId: admin.employerId,
                isOwner: !!admin.isOwner,
            },
            employer,
        });
    }
    catch (e) {
        console.error('SIGNIN ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// POST /auth/signout
router.post('/signout', (_req, res) => {
    res.setHeader('Set-Cookie', (0, cookie_1.serialize)('token', '', {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
        maxAge: 0,
    }));
    return res.status(204).end();
});
// GET /auth/me
router.get('/me', async (req, res) => {
    try {
        const raw = req.headers.cookie || '';
        const cookies = (0, cookie_1.parse)(raw);
        const token = cookies['token'];
        if (!token)
            return res.status(401).json({ message: 'Unauthorized' });
        const payload = verifyToken(token); // { uid, role, eid }
        const admin = await prisma_1.prisma.employerAdminUser.findUnique({
            where: { id: payload.uid },
            select: {
                id: true,
                email: true,
                fullName: true,
                employerId: true,
                isOwner: true,
                createdAt: true,
            },
        });
        if (!admin)
            return res.status(401).json({ message: 'Unauthorized' });
        let employer = null;
        if (payload.eid) {
            employer =
                (await prisma_1.prisma.employer.findUnique({
                    where: { id: payload.eid },
                    select: { id: true, slug: true, displayName: true, legalName: true },
                })) || null;
        }
        if (!employer) {
            employer = await resolveEmployerBySlugOrLatest({});
        }
        return res.json({ ...admin, role: payload.role, employer });
    }
    catch (e) {
        console.error('ME ERROR:', e);
        return res.status(401).json({ message: 'Invalid token' });
    }
});
// POST /auth/switch-employer
router.post('/switch-employer', async (req, res) => {
    try {
        const raw = req.headers.cookie || '';
        const cookies = (0, cookie_1.parse)(raw);
        const token = cookies['token'];
        if (!token)
            return res.status(401).json({ message: 'Unauthorized' });
        const payload = verifyToken(token);
        const parsed = switchEmployerSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { employerId, employerSlug } = parsed.data;
        // karena admin selalu terikat ke satu employerId,
        // kita abaikan input lain dan gunakan employerId milik admin saat ini bila tidak ada slug/id valid
        let employer = null;
        if (employerId) {
            employer = await prisma_1.prisma.employer.findUnique({
                where: { id: employerId },
                select: { id: true, slug: true, displayName: true, legalName: true },
            });
        }
        else if (employerSlug) {
            employer = await prisma_1.prisma.employer.findUnique({
                where: { slug: employerSlug },
                select: { id: true, slug: true, displayName: true, legalName: true },
            });
        }
        else {
            employer =
                (await prisma_1.prisma.employer.findUnique({
                    where: { id: (await prisma_1.prisma.employerAdminUser.findUnique({ where: { id: payload.uid } }))?.employerId },
                    select: { id: true, slug: true, displayName: true, legalName: true },
                })) || (await resolveEmployerBySlugOrLatest({}));
        }
        if (!employer)
            return res.status(404).json({ message: 'Employer tidak ditemukan' });
        const newToken = signToken({ uid: payload.uid, role: payload.role, eid: employer.id });
        setAuthCookie(res, newToken);
        return res.json({ ok: true, employer });
    }
    catch (e) {
        console.error('SWITCH EMPLOYER ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
exports.default = router;
