"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie = __importStar(require("cookie"));
const prisma_1 = require("../lib/prisma"); // gunakan prisma instance bersama
const router = (0, express_1.Router)();
/** ==== JWT util ==== */
const ADMIN_JWT_SECRET = process.env.JWT_ADMIN_SECRET || 'dev-admin-secret';
const sign = (p) => jsonwebtoken_1.default.sign(p, ADMIN_JWT_SECRET, { expiresIn: '7d' });
const verify = (t) => jsonwebtoken_1.default.verify(t, ADMIN_JWT_SECRET);
const setCookie = (res, token) => res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 60 * 60 * 24 * 7, // 7 hari
}));
const clearCookie = (res) => res.setHeader('Set-Cookie', cookie.serialize('admin_token', '', {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: 0,
}));
/** ==== Middleware auth admin ==== */
function requireAdmin(req, res, next) {
    try {
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies['admin_token'];
        if (!token)
            return res.status(401).json({ message: 'Unauthorized' });
        const payload = verify(token);
        req.adminId = payload.aid;
        req.employerId = payload.eid;
        next();
    }
    catch {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
/** ==== Schemas ==== */
const signinSchema = zod_1.z.object({
    // schema kamu punya EmployerAdminUser { email, passwordHash, ... }
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(6),
});
/** ==== Routes ==== */
// test cepat
router.get('/ping', (_req, res) => res.json({ ok: true }));
// POST /api/admin/signin
router.post('/signin', async (req, res) => {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success)
        return res.status(400).json({ error: parsed.error.format() });
    const { email, password } = parsed.data;
    const admin = await prisma_1.prisma.employerAdminUser.findUnique({
        where: { email: String(email) },
    });
    if (!admin)
        return res.status(401).json({ message: 'Email atau password salah' });
    const ok = await bcryptjs_1.default.compare(String(password), admin.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Email atau password salah' });
    // sign token: admin id + employer id
    const token = sign({ aid: admin.id, eid: admin.employerId });
    setCookie(res, token);
    return res.json({
        ok: true,
        admin: {
            id: admin.id,
            email: admin.email,
            fullName: admin.fullName ?? null,
            employerId: admin.employerId,
            isOwner: !!admin.isOwner,
            createdAt: admin.createdAt,
        },
    });
});
// POST /api/admin/signout
router.post('/signout', (_req, res) => {
    clearCookie(res);
    res.status(204).end();
});
// GET /api/admin/me
router.get('/me', requireAdmin, async (req, res) => {
    const admin = await prisma_1.prisma.employerAdminUser.findUnique({
        where: { id: req.adminId },
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
    return res.json(admin);
});
// GET /api/admin/stats
router.get('/stats', requireAdmin, async (_req, res) => {
    const [employers, jobs, subscriptions, admins] = await Promise.all([
        prisma_1.prisma.employer.count(),
        prisma_1.prisma.job.count(),
        prisma_1.prisma.subscription.count(),
        prisma_1.prisma.employerAdminUser.count(),
    ]);
    res.json({ employers, jobs, subscriptions, admins });
});
exports.default = router;
