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
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie = __importStar(require("cookie"));
const prisma = new client_1.PrismaClient();
const router = (0, express_1.Router)();
const ADMIN_JWT_SECRET = process.env.JWT_ADMIN_SECRET || 'dev-admin-secret';
const sign = (p) => jsonwebtoken_1.default.sign(p, ADMIN_JWT_SECRET, { expiresIn: '7d' });
const verify = (t) => jsonwebtoken_1.default.verify(t, ADMIN_JWT_SECRET);
const setCookie = (res, token) => res.setHeader('Set-Cookie', cookie.serialize('admin_token', token, {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 60 * 60 * 24 * 7,
}));
const clearCookie = (res) => res.setHeader('Set-Cookie', cookie.serialize('admin_token', '', {
    httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production',
    path: '/', maxAge: 0,
}));
const signinSchema = zod_1.z.object({ username: zod_1.z.string().min(3), password: zod_1.z.string().min(6) });
function requireAdmin(req, res, next) {
    try {
        const cookies = cookie.parse(req.headers.cookie || '');
        const token = cookies['admin_token'];
        if (!token)
            return res.status(401).json({ message: 'Unauthorized' });
        req.adminId = verify(token).aid;
        next();
    }
    catch {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
// untuk test cepat
router.get('/ping', (_req, res) => res.json({ ok: true }));
router.post('/signin', async (req, res) => {
    const p = signinSchema.safeParse(req.body);
    if (!p.success)
        return res.status(400).json({ error: p.error.format() });
    const { username, password } = p.data;
    const admin = await prisma.admin.findUnique({ where: { username } });
    if (!admin)
        return res.status(401).json({ message: 'Username atau password salah' });
    const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
    if (!ok)
        return res.status(401).json({ message: 'Username atau password salah' });
    setCookie(res, sign({ aid: admin.id }));
    res.json({ id: admin.id, username: admin.username, createdAt: admin.createdAt });
});
router.post('/signout', (_req, res) => { clearCookie(res); res.status(204).end(); });
router.get('/me', requireAdmin, async (req, res) => {
    const admin = await prisma.admin.findUnique({
        where: { id: req.adminId },
        select: { id: true, username: true, createdAt: true },
    });
    if (!admin)
        return res.status(401).json({ message: 'Unauthorized' });
    res.json(admin);
});
router.get('/stats', requireAdmin, async (_req, res) => {
    const users = await prisma.user.count();
    const admins = await prisma.admin.count();
    res.json({ users, admins });
});
exports.default = router;
