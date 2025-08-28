"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/employer-auth.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const cookie_1 = require("cookie");
const EMP_COOKIE = 'emp_session';
const SESSION_HOURS = 12;
function makeCookie(id) {
    const isProd = process.env.NODE_ENV === 'production';
    return (0, cookie_1.serialize)(EMP_COOKIE, id, {
        httpOnly: true,
        secure: isProd, // di localhost otomatis false
        sameSite: 'lax', // aman untuk http://localhost
        path: '/',
        maxAge: SESSION_HOURS * 60 * 60,
    });
}
const router = (0, express_1.Router)();
/**
 * POST /api/employers/auth/signin
 * body: { usernameOrEmail, password } ATAU { email, password }
 */
router.post('/signin', async (req, res) => {
    var _a, _b, _c;
    const usernameOrEmail = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.usernameOrEmail) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.email;
    const { password } = req.body || {};
    if (!usernameOrEmail || !password) {
        return res.status(400).json({ error: 'MISSING_CREDENTIALS' });
    }
    // cari admin user employer (by email atau nama lengkap)
    const admin = await prisma_1.prisma.employerAdminUser.findFirst({
        where: {
            OR: [
                { email: usernameOrEmail },
                { fullName: usernameOrEmail },
            ],
        },
        select: {
            id: true,
            email: true,
            passwordHash: true,
            employerId: true,
            employer: { select: { id: true, slug: true, displayName: true } },
        },
    });
    if (!admin || !admin.passwordHash) {
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
    if (!ok)
        return res.status(401).json({ error: 'INVALID_CREDENTIALS' });
    // pastikan employer ada
    const employer = await prisma_1.prisma.employer.findUnique({
        where: { id: admin.employerId },
        select: { id: true, slug: true, displayName: true },
    });
    if (!employer)
        return res.status(401).json({ error: 'NO_EMPLOYER' });
    // buat session TANPA userId (null) + employerId DIISI (hindari FK ke User)
    const now = Date.now();
    const session = await prisma_1.prisma.session.create({
        data: {
            userId: null, // penting: null supaya tidak kena FK ke User
            employerId: employer.id,
            createdAt: new Date(now),
            lastSeenAt: new Date(now),
            expiresAt: new Date(now + SESSION_HOURS * 60 * 60 * 1000),
            ip: req.ip,
            userAgent: req.get('user-agent') || '',
        },
        select: { id: true },
    });
    res.setHeader('Set-Cookie', makeCookie(session.id));
    return res.json({
        ok: true,
        admin: { id: admin.id, email: admin.email }, // opsional dikembalikan di response signin
        employer,
    });
});
/**
 * POST /api/employers/auth/signout
 */
router.post('/signout', async (req, res) => {
    try {
        const sid = (0, cookie_1.parse)(req.headers.cookie || '')[EMP_COOKIE];
        if (sid) {
            await prisma_1.prisma.session.updateMany({
                where: { id: sid, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }
    }
    catch { }
    // hapus cookie
    res.setHeader('Set-Cookie', (0, cookie_1.serialize)(EMP_COOKIE, '', {
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
        sameSite: 'lax',
        path: '/',
        maxAge: 0,
    }));
    res.status(204).end();
});
/**
 * GET /api/employers/auth/me
 * Validasi cookie session → kembalikan employer + admin (dengan email)
 */
router.get('/me', async (req, res) => {
    const sid = (0, cookie_1.parse)(req.headers.cookie || '')[EMP_COOKIE];
    if (!sid)
        return res.status(401).json({ error: 'NO_SESSION' });
    const s = await prisma_1.prisma.session.findUnique({
        where: { id: sid },
        select: {
            employerId: true,
            revokedAt: true,
            expiresAt: true,
        },
    });
    if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date()) || !s.employerId) {
        return res.status(401).json({ error: 'NO_SESSION' });
    }
    const [employer, admin] = await Promise.all([
        prisma_1.prisma.employer.findUnique({
            where: { id: s.employerId },
            select: { id: true, slug: true, displayName: true, legalName: true, website: true },
        }),
        prisma_1.prisma.employerAdminUser.findFirst({
            where: { employerId: s.employerId },
            orderBy: { isOwner: 'desc' }, // utamakan owner jika ada
            select: { id: true, email: true, fullName: true, isOwner: true },
        }),
    ]);
    if (!employer)
        return res.status(404).json({ error: 'EMPLOYER_NOT_FOUND' });
    return res.json({
        ok: true,
        role: 'employer',
        employer,
        admin: admin !== null && admin !== void 0 ? admin : { id: 'employer-admin', email: null, fullName: null, isOwner: undefined },
    });
});
exports.default = router;
