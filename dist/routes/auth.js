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
/** ================== ENV ================== **/
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' ||
    (process.env.NODE_ENV === 'production' && COOKIE_SAMESITE === 'none');
function signToken(p) {
    return jsonwebtoken_1.default.sign(p, JWT_SECRET, { expiresIn: '7d' });
}
function verifyToken(t) {
    return jsonwebtoken_1.default.verify(t, JWT_SECRET);
}
function setAuthCookie(res, token) {
    res.setHeader('Set-Cookie', (0, cookie_1.serialize)('token', token, {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: 60 * 60 * 24 * 7, // 7 hari
    }));
}
/** ================= Validators ================= **/
const userSignupSchema = zod_1.z.object({
    name: zod_1.z.string().min(2).max(100),
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
const userSigninSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
});
const adminSigninSchema = zod_1.z.object({
    username: zod_1.z.string().min(3),
    password: zod_1.z.string().min(8),
});
/** ================= Routes ================= **/
// GET /auth
router.get('/', (_req, res) => {
    res.json({ message: 'Auth route works!' });
});
/** ---------------- USER: SIGNUP ---------------- */
// POST /auth/signup
router.post('/signup', async (req, res) => {
    try {
        const parsed = userSignupSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { name, email, password } = parsed.data;
        const exists = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (exists)
            return res.status(409).json({ message: 'Email already used' });
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        const user = await prisma_1.prisma.user.create({
            data: { name, email, passwordHash },
            select: { id: true, name: true, email: true, photoUrl: true, cvUrl: true, createdAt: true },
        });
        const token = signToken({ uid: user.id, role: 'user' });
        setAuthCookie(res, token);
        return res.status(201).json(user);
    }
    catch (e) {
        console.error('USER SIGNUP ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
/** ---------------- USER: SIGNIN ---------------- */
// POST /auth/signin
router.post('/signin', async (req, res) => {
    try {
        const parsed = userSigninSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { email, password } = parsed.data;
        const user = await prisma_1.prisma.user.findUnique({ where: { email } });
        if (!user)
            return res.status(401).json({ message: 'Email atau password salah' });
        const ok = await bcryptjs_1.default.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ message: 'Email atau password salah' });
        const token = signToken({ uid: user.id, role: 'user' });
        setAuthCookie(res, token);
        return res.json({
            id: user.id,
            email: user.email,
            name: user.name ?? null,
            photoUrl: user.photoUrl ?? null,
            cvUrl: user.cvUrl ?? null,
            role: 'user',
        });
    }
    catch (e) {
        console.error('USER SIGNIN ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
/** ---------------- USER: SIGNOUT ---------------- */
// POST /auth/signout
router.post('/signout', (_req, res) => {
    res.setHeader('Set-Cookie', (0, cookie_1.serialize)('token', '', {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: 0,
    }));
    return res.status(204).end();
});
/** ---------------- USER/ADMIN: ME ---------------- */
// GET /auth/me
router.get('/me', async (req, res) => {
    try {
        const raw = req.headers.cookie || '';
        const cookies = (0, cookie_1.parse)(raw);
        const token = cookies['token'];
        if (!token)
            return res.status(401).json({ message: 'Unauthorized' });
        const payload = verifyToken(token); // { uid, role }
        if (payload.role === 'user') {
            const u = await prisma_1.prisma.user.findUnique({
                where: { id: payload.uid },
                select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true },
            });
            if (!u)
                return res.status(401).json({ message: 'Unauthorized' });
            return res.json({ ...u, role: 'user' });
        }
        // role === 'admin'
        const a = await prisma_1.prisma.admin.findUnique({
            where: { id: payload.uid },
            select: { id: true, username: true, createdAt: true },
        });
        if (!a)
            return res.status(401).json({ message: 'Unauthorized' });
        return res.json({ id: a.id, email: `${a.username}@local`, name: a.username, role: 'admin' });
    }
    catch (e) {
        console.error('ME ERROR:', e);
        return res.status(401).json({ message: 'Invalid token' });
    }
});
/** ---------------- ADMIN: SIGNIN ---------------- */
// POST /admin/signin
router.post('/admin/signin', async (req, res) => {
    try {
        const parsed = adminSigninSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { username, password } = parsed.data;
        const admin = await prisma_1.prisma.admin.findUnique({ where: { username } });
        if (!admin)
            return res.status(401).json({ message: 'Username atau password salah' });
        const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!ok)
            return res.status(401).json({ message: 'Username atau password salah' });
        const token = signToken({ uid: admin.id, role: 'admin' });
        setAuthCookie(res, token);
        return res.json({ id: admin.id, email: `${admin.username}@local`, name: admin.username, role: 'admin' });
    }
    catch (e) {
        console.error('ADMIN SIGNIN ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
/** ---------------- ADMIN: SIGNOUT (opsional) ---------------- */
router.post('/admin/signout', (_req, res) => {
    res.setHeader('Set-Cookie', (0, cookie_1.serialize)('token', '', {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: 0,
    }));
    return res.status(204).end();
});
exports.default = router;
