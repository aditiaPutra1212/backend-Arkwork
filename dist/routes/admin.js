"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/admin.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const zod_1 = require("zod");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const role_1 = require("../middleware/role");
const router = (0, express_1.Router)();
const IS_LOCAL = process.env.NODE_ENV !== 'production';
// tokens & cookie flags
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || 'dev-admin-secret';
// SameSite/secure defaults: local = None + not secure; prod = None + secure
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || (IS_LOCAL ? 'none' : 'none'));
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' ||
    (!IS_LOCAL && COOKIE_SAMESITE === 'none'); // chrome requires Secure when SameSite=None on https (prod)
function signAdminToken(payload) {
    return jsonwebtoken_1.default.sign(payload, JWT_ADMIN_SECRET, { expiresIn: '7d' });
}
function setAdminCookie(res, token) {
    res.cookie(role_1.ADMIN_COOKIE, token, {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE && !IS_LOCAL ? true : false, // keep false on localhost
        path: '/',
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
const adminSigninSchema = zod_1.z.object({
    usernameOrEmail: zod_1.z.string().min(3),
    password: zod_1.z.string().min(6),
});
router.post('/signin', async (req, res) => {
    try {
        const parsed = adminSigninSchema.safeParse(req.body);
        if (!parsed.success) {
            return res.status(400).json({ error: parsed.error.format() });
        }
        const { usernameOrEmail, password } = parsed.data;
        // resolve username by email or username
        const emailsEnv = (process.env.ADMIN_EMAILS || '')
            .split(',')
            .map(s => s.trim().toLowerCase())
            .filter(Boolean);
        const hasAt = usernameOrEmail.includes('@');
        const lower = usernameOrEmail.toLowerCase();
        let usernameToFind = null;
        if (hasAt) {
            if (emailsEnv.length > 0 && emailsEnv.includes(lower) && process.env.ADMIN_USERNAME) {
                usernameToFind = process.env.ADMIN_USERNAME;
            }
            else {
                usernameToFind = usernameOrEmail.split('@')[0];
            }
        }
        else {
            usernameToFind = usernameOrEmail;
        }
        const admin = await prisma_1.prisma.admin.findUnique({ where: { username: usernameToFind } });
        if (!admin)
            return res.status(401).json({ message: 'Email/Username atau password salah' });
        const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!ok)
            return res.status(401).json({ message: 'Email/Username atau password salah' });
        const token = signAdminToken({ uid: admin.id, role: 'admin' });
        setAdminCookie(res, token);
        return res.json({ ok: true, admin: { id: admin.id, username: admin.username } });
    }
    catch (e) {
        console.error('ADMIN SIGNIN ERROR:', e);
        return res.status(500).json({ message: 'Internal server error' });
    }
});
// restore session
router.get('/me', async (req, res) => {
    try {
        const raw = req.cookies?.[role_1.ADMIN_COOKIE];
        if (!raw)
            return res.status(401).json({ message: 'Unauthorized' });
        const payload = jsonwebtoken_1.default.verify(raw, JWT_ADMIN_SECRET);
        const admin = await prisma_1.prisma.admin.findUnique({
            where: { id: payload.uid },
            select: { id: true, username: true },
        });
        if (!admin)
            return res.status(401).json({ message: 'Unauthorized' });
        return res.json({ id: admin.id, username: admin.username, role: 'admin' });
    }
    catch {
        return res.status(401).json({ message: 'Invalid token' });
    }
});
// optional signout
router.post('/signout', (req, res) => {
    res.clearCookie(role_1.ADMIN_COOKIE, { path: '/' });
    res.json({ ok: true });
});
exports.default = router;
