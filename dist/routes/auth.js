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
exports.signUserToken = signUserToken;
exports.signAdminToken = signAdminToken;
exports.verifyUserToken = verifyUserToken;
exports.verifyAdminToken = verifyAdminToken;
exports.setCookie = setCookie;
exports.clearCookie = clearCookie;
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const zod_1 = require("zod");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = require("cookie");
const crypto_1 = require("crypto");
// Pastikan path import mailer ini benar menunjuk ke file mailer.ts Anda
const mailer_1 = require("../lib/mailer");
// Pastikan path import middleware role ini benar
const role_1 = require("../middleware/role");
const authController = __importStar(require("../controllers/auth.controller"));
const router = (0, express_1.Router)();
/* ===== env & cookie flags ===== */
const NODE_ENV = process.env.NODE_ENV || 'development';
const IS_PROD = NODE_ENV === 'production';
const JWT_SECRET = process.env.JWT_SECRET || (IS_PROD ? undefined : 'dev-secret-change-me');
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;
const FRONTEND_URL = process.env.FRONTEND_URL || 'http://localhost:3000'; // Untuk link verifikasi
if (IS_PROD && !JWT_SECRET)
    console.error('[FATAL] JWT_SECRET is required in production');
if (IS_PROD && !process.env.JWT_ADMIN_SECRET)
    console.error('[FATAL] JWT_ADMIN_SECRET is recommended');
const COOKIE_SAMESITE = process.env.COOKIE_SAMESITE || (IS_PROD ? 'none' : 'lax');
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (IS_PROD && COOKIE_SAMESITE === 'none');
if (!IS_PROD) {
    console.log(`[AUTH] Running in dev mode. Cookie defaults: sameSite=${COOKIE_SAMESITE}, secure=${COOKIE_SECURE}`);
}
/* ===== JWT options ===== */
const JWT_USER_ISSUER = process.env.JWT_USER_ISSUER || 'arkwork';
const JWT_USER_AUDIENCE = process.env.JWT_USER_AUDIENCE || 'arkwork-users';
const JWT_ADMIN_ISSUER = process.env.JWT_ADMIN_ISSUER || 'arkwork-admin';
const JWT_ADMIN_AUDIENCE = process.env.JWT_ADMIN_AUDIENCE || 'arkwork-admins';
// --- TAMBAHKAN EXPORT ---
function signUserToken(payload) {
    var _a;
    if (!JWT_SECRET)
        throw new Error('JWT_SECRET not set');
    return jsonwebtoken_1.default.sign({ uid: payload.uid, role: (_a = payload.role) !== null && _a !== void 0 ? _a : 'user' }, JWT_SECRET, {
        expiresIn: '30d',
        issuer: JWT_USER_ISSUER,
        audience: JWT_USER_AUDIENCE,
    });
}
// --- TAMBAHKAN EXPORT JIKA DIPERLUKAN DI TEMPAT LAIN ---
function signAdminToken(payload) {
    var _a;
    if (!JWT_ADMIN_SECRET)
        throw new Error('JWT_ADMIN_SECRET not set');
    return jsonwebtoken_1.default.sign({ uid: payload.uid, role: (_a = payload.role) !== null && _a !== void 0 ? _a : 'admin' }, JWT_ADMIN_SECRET, {
        expiresIn: '7d',
        issuer: JWT_ADMIN_ISSUER,
        audience: JWT_ADMIN_AUDIENCE,
    });
}
// --- TAMBAHKAN EXPORT JIKA DIPERLUKAN DI TEMPAT LAIN ---
function verifyUserToken(token) {
    if (!JWT_SECRET)
        throw new Error('JWT_SECRET not set');
    return jsonwebtoken_1.default.verify(token, JWT_SECRET, { issuer: JWT_USER_ISSUER, audience: JWT_USER_AUDIENCE });
}
// --- TAMBAHKAN EXPORT JIKA DIPERLUKAN DI TEMPAT LAIN ---
function verifyAdminToken(token) {
    if (!JWT_ADMIN_SECRET)
        throw new Error('JWT_ADMIN_SECRET not set');
    return jsonwebtoken_1.default.verify(token, JWT_ADMIN_SECRET, { issuer: JWT_ADMIN_ISSUER, audience: JWT_ADMIN_AUDIENCE });
}
// --- TAMBAHKAN EXPORT ---
function setCookie(res, name, token, maxAgeSec = 7 * 24 * 60 * 60) {
    const opts = {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: maxAgeSec * 1000,
    };
    console.log(`[AUTH][setCookie] Setting cookie '${name}' with options:`, opts);
    res.cookie(name, token, opts);
}
// --- TAMBAHKAN EXPORT ---
function clearCookie(res, name) {
    const opts = {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE,
        path: '/',
        maxAge: 0,
    };
    console.log(`[AUTH][clearCookie] Clearing cookie '${name}' with options:`, opts);
    res.clearCookie(name, opts);
}
/* ===== validators ===== */
const userSignupSchema = zod_1.z.object({
    name: zod_1.z.string().min(2, "Name must be at least 2 characters").max(100),
    email: zod_1.z.string().email("Invalid email address"),
    password: zod_1.z.string().min(8, "Password must be at least 8 characters"),
});
const userSigninSchema = zod_1.z.object({
    usernameOrEmail: zod_1.z.string().min(3, "Email/Username is required"),
    password: zod_1.z.string().min(1, "Password is required"),
});
const adminSigninSchema = zod_1.z.object({
    username: zod_1.z.string().min(3),
    password: zod_1.z.string().min(1),
});
const verifyTokenSchema = zod_1.z.object({
    token: zod_1.z.string().length(64, "Invalid token format").regex(/^[a-f0-9]+$/i, "Invalid token characters"),
});
/* ===== routes ===== */
router.get('/', (_req, res) => res.json({ message: 'Auth route works!' }));
router.post('/forgot', authController.forgotPassword);
router.post('/reset-password', authController.resetPassword);
router.get('/verify-token/:token', authController.verifyToken);
/* ----- USER SIGNUP (Sends Verification Email) ----- */
router.post('/signup', async (req, res, next) => {
    var _a, _b;
    try {
        const parsed = userSignupSchema.safeParse(req.body);
        if (!parsed.success) {
            // [DIUBAH] Pesan error lebih ramah dan aman
            return res.status(400).json({ message: "Data yang Anda masukkan tidak valid. Periksa kembali." });
        }
        const { name, email, password } = parsed.data;
        const lowerEmail = email.toLowerCase().trim();
        const exists = await prisma_1.prisma.user.findUnique({ where: { email: lowerEmail } });
        if (exists) {
            if (!exists.isVerified && exists.verificationTokenExpiresAt && exists.verificationTokenExpiresAt > new Date()) {
                // [LOG DIHAPUS]
                return res.status(409).json({ message: 'Email registered, awaiting verification. Check inbox/spam.' });
            }
            return res.status(409).json({ message: 'Email address already registered.' });
        }
        const passwordHash = await bcryptjs_1.default.hash(password, 10);
        if (!passwordHash)
            throw new Error("Password hashing failed");
        const user = await prisma_1.prisma.user.create({
            data: { name: name.trim(), email: lowerEmail, passwordHash, isVerified: false },
            select: { id: true, email: true, name: true },
        });
        const token = (0, crypto_1.randomBytes)(32).toString('hex');
        const expires = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
        await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { verificationToken: token, verificationTokenExpiresAt: expires },
        });
        const verificationUrl = `${FRONTEND_URL}/auth/verify?token=${token}`;
        try {
            await (0, mailer_1.sendVerificationEmail)(user.email, user.name, verificationUrl);
            console.log(`[AUTH][SIGNUP] Verification email initiated for ${user.email}`);
        }
        catch (emailError) {
            console.error(`[AUTH][SIGNUP] CRITICAL: Email send failed for ${user.email}:`, (emailError === null || emailError === void 0 ? void 0 : emailError.message) || emailError);
            await prisma_1.prisma.user.delete({ where: { id: user.id } }).catch(delErr => console.error(`[AUTH][SIGNUP] Rollback failed for user ${user.id}`, delErr));
            return res.status(500).json({ message: 'Verification email failed. Please try again.' });
        }
        return res.status(201).json({
            ok: true,
            message: 'Account created! Check email inbox/spam for verification link.'
        });
    }
    catch (e) {
        console.error('[AUTH][SIGNUP] Error:', e);
        if (e.code === 'P2002' && ((_b = (_a = e.meta) === null || _a === void 0 ? void 0 : _a.target) === null || _b === void 0 ? void 0 : _b.includes('email'))) {
            return res.status(409).json({ message: 'Email address already registered.' });
        }
        next(e);
    }
});
/* ----- USER SIGNIN (Checks Verification Status) ----- */
router.post('/signin', async (req, res, next) => {
    try {
        const parsed = userSigninSchema.safeParse(req.body);
        if (!parsed.success) {
            // [DIUBAH] Pesan error lebih ramah dan aman
            return res.status(400).json({ message: "Email/Username atau Password tidak boleh kosong." });
        }
        const { usernameOrEmail, password } = parsed.data;
        const input = usernameOrEmail.trim();
        const userCredentials = input.includes('@')
            ? await prisma_1.prisma.user.findUnique({ where: { email: input.toLowerCase() }, select: { id: true, passwordHash: true, isVerified: true, email: true } })
            : await prisma_1.prisma.user.findFirst({ where: { name: input }, select: { id: true, passwordHash: true, isVerified: true, email: true } });
        if (!userCredentials) {
            // [LOG DIHAPUS]
            return res.status(401).json({ message: 'Incorrect credentials.' });
        }
        if (!userCredentials.passwordHash) {
            // [LOG DIHAPUS]
            return res.status(401).json({ message: 'Account uses Google Sign-In.' });
        }
        const passwordMatch = await bcryptjs_1.default.compare(password, userCredentials.passwordHash);
        if (!passwordMatch) {
            // [LOG DIHAPUS]
            return res.status(401).json({ message: 'Incorrect password.' });
        }
        if (!userCredentials.isVerified) {
            // [LOG DIHAPUS]
            return res.status(403).json({ message: 'Email not verified. Check inbox/spam.' });
        }
        const user = await prisma_1.prisma.user.findUnique({
            where: { id: userCredentials.id },
            select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true }
        });
        if (!user) {
            console.error(`[AUTH][SIGNIN][FAIL] Verified user vanished: ${userCredentials.id}`);
            return res.status(500).json({ message: 'Internal error.' });
        }
        console.log(`[AUTH][SIGNIN] User ${user.email} authenticated.`);
        const token = signUserToken({ uid: user.id, role: 'user' });
        setCookie(res, role_1.USER_COOKIE, token, 30 * 24 * 60 * 60); // Use USER_COOKIE
        return res.json({ ok: true, user: { ...user, role: 'user' } });
    }
    catch (e) {
        console.error('[AUTH][SIGNIN] Error:', e);
        next(e);
    }
});
/* ----- USER SIGNOUT ----- */
router.post('/signout', (_req, res) => {
    clearCookie(res, role_1.USER_COOKIE);
    clearCookie(res, role_1.EMP_COOKIE);
    clearCookie(res, role_1.ADMIN_COOKIE);
    return res.status(204).end();
});
/* ----- ME (Checks Verification Status) ----- */
router.get('/me', async (req, res, next) => {
    const cookies = (0, cookie_1.parse)(req.headers.cookie || '');
    const userToken = cookies[role_1.USER_COOKIE];
    const adminToken = cookies[role_1.ADMIN_COOKIE];
    if (adminToken) { /* ... Admin check ... */
        if (!JWT_ADMIN_SECRET) {
            return res.status(500).json({ message: 'Server misconfiguration' });
        }
        try {
            const payload = verifyAdminToken(adminToken);
            console.log('[AUTH][ME] Decoded Admin Payload:', payload);
            if (!payload || !payload.uid)
                throw new Error("Invalid admin payload");
            const a = await prisma_1.prisma.admin.findUnique({ where: { id: payload.uid }, select: { id: true, username: true, createdAt: true } });
            if (!a) {
                clearCookie(res, role_1.ADMIN_COOKIE);
                return res.status(401).json({ message: 'Admin session invalid.' });
            }
            return res.json({ ok: true, data: { ...a, role: 'admin' } });
        }
        catch (err) {
            clearCookie(res, role_1.ADMIN_COOKIE);
            if (err instanceof jsonwebtoken_1.default.JsonWebTokenError || err instanceof jsonwebtoken_1.default.TokenExpiredError) {
                return res.status(401).json({ message: `Unauthorized (Admin): ${err.message}` });
            }
            console.error('[AUTH][ME] Admin check error:', err);
            return next(err);
        }
    }
    if (userToken) { /* ... User check ... */
        if (!JWT_SECRET) {
            return res.status(500).json({ message: 'Server misconfiguration' });
        }
        try {
            const payload = verifyUserToken(userToken);
            console.log('[AUTH][ME] Decoded User Payload:', payload);
            if (!payload || !payload.uid)
                throw new Error("Invalid user payload");
            const u = await prisma_1.prisma.user.findUnique({
                where: { id: payload.uid },
                select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true, isVerified: true }
            });
            if (!u) {
                // [LOG DIHAPUS]
                clearCookie(res, role_1.USER_COOKIE);
                return res.status(401).json({ message: 'User session invalid.' });
            }
            if (!u.isVerified) {
                // [LOG DIHAPUS]
                clearCookie(res, role_1.USER_COOKIE);
                return res.status(403).json({ message: 'Account not verified.' });
            }
            const { isVerified, ...userDataToSend } = u;
            return res.json({ ok: true, data: { ...userDataToSend, role: 'user' } });
        }
        catch (err) {
            // [LOG DIHAPUS]
            clearCookie(res, role_1.USER_COOKIE);
            if (err instanceof jsonwebtoken_1.default.JsonWebTokenError || err instanceof jsonwebtoken_1.default.TokenExpiredError) {
                return res.status(401).json({ message: `Unauthorized (User): ${err.message}` });
            }
            console.error('[AUTH][ME] User check unexpected error:', err);
            return next(err);
        }
    }
    return res.status(401).json({ message: 'Unauthorized: No session found' });
});
/* ----- VERIFY EMAIL ----- */
router.post('/verify', async (req, res, next) => {
    try {
        const parsed = verifyTokenSchema.safeParse(req.body);
        if (!parsed.success) {
            // [LOG DIHAPUS]
            return res.status(400).json({ message: "Invalid verification link format." });
        }
        const { token } = parsed.data;
        console.log(`[AUTH][VERIFY] Verifying token prefix: ${token.substring(0, 10)}...`);
        const user = await prisma_1.prisma.user.findFirst({
            where: { verificationToken: token, verificationTokenExpiresAt: { gt: new Date() }, isVerified: false },
        });
        if (!user) {
            // [LOG DIHAPUS]
            const existingTokenUser = await prisma_1.prisma.user.findFirst({ where: { verificationToken: token } });
            if (existingTokenUser === null || existingTokenUser === void 0 ? void 0 : existingTokenUser.isVerified)
                return res.status(400).json({ message: "Email already verified. Please log in." });
            if ((existingTokenUser === null || existingTokenUser === void 0 ? void 0 : existingTokenUser.verificationTokenExpiresAt) && existingTokenUser.verificationTokenExpiresAt <= new Date())
                return res.status(400).json({ message: "Verification link expired." });
            return res.status(400).json({ message: "Invalid verification link." });
        }
        console.log(`[AUTH][VERIFY] Token valid for user: ${user.email}`);
        const updatedUser = await prisma_1.prisma.user.update({
            where: { id: user.id },
            data: { isVerified: true, verificationToken: null, verificationTokenExpiresAt: null },
            select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true, createdAt: true },
        });
        const loginToken = signUserToken({ uid: updatedUser.id, role: 'user' });
        setCookie(res, role_1.USER_COOKIE, loginToken, 30 * 24 * 60 * 60); // Auto-login
        console.log(`[AUTH][VERIFY] User ${user.email} verified & logged in.`);
        return res.json({ ok: true, message: 'Email verified! You are logged in.', user: { ...updatedUser, role: 'user' } });
    }
    catch (e) {
        console.error('[AUTH][VERIFY] Error:', e);
        if (e.code === 'P2002')
            console.error(`[AUTH][VERIFY] CRITICAL: Duplicate token!`);
        return res.status(500).json({ message: 'Internal verification error.' });
    }
});
/* ----- ADMIN SIGNIN ----- */
router.post('/admin/signin', async (req, res, next) => {
    /* ... Admin signin logic ... */
    try {
        const parsed = adminSigninSchema.safeParse(req.body);
        if (!parsed.success) {
            // [DIUBAH] Pesan error lebih ramah dan aman
            return res.status(400).json({ message: "Username atau Password tidak boleh kosong." });
        }
        const { username, password } = parsed.data;
        const admin = await prisma_1.prisma.admin.findUnique({ where: { username } });
        if (!admin)
            return res.status(401).json({ message: 'Incorrect credentials.' });
        if (!admin.passwordHash) {
            return res.status(500).json({ message: 'Admin config error.' });
        }
        const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!ok)
            return res.status(401).json({ message: 'Incorrect credentials.' });
        const token = signAdminToken({ uid: admin.id, role: 'admin' });
        setCookie(res, role_1.ADMIN_COOKIE, token, 7 * 24 * 60 * 60);
        return res.json({ ok: true, data: { id: admin.id, username: admin.username, role: 'admin' } });
    }
    catch (e) {
        console.error('ADMIN SIGNIN ERROR:', e);
        next(e);
    }
});
/* ----- ADMIN SIGNOUT ----- */
router.post('/admin/signout', (_req, res) => {
    /* ... Admin signout logic ... */
    clearCookie(res, role_1.ADMIN_COOKIE);
    clearCookie(res, role_1.USER_COOKIE);
    clearCookie(res, role_1.EMP_COOKIE);
    return res.status(204).end();
});
exports.default = router;
