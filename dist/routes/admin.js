"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b;
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/admin.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const IS_LOCAL = process.env.NODE_ENV !== "production";
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || "admin_token";
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || "";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || (IS_LOCAL ? "lax" : "lax"));
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (!IS_LOCAL && COOKIE_SAMESITE === 'none');
if (!IS_LOCAL && !JWT_ADMIN_SECRET) {
    console.error("[FATAL] JWT_ADMIN_SECRET is required in production.");
}
// Very small in-memory rate limiter for signin attempts (dev only; replace with Redis in prod)
const SIGNIN_LIMIT_WINDOW_MS = Number((_a = process.env.SIGNIN_RATE_WINDOW_MS) !== null && _a !== void 0 ? _a : 60000);
const SIGNIN_LIMIT_MAX = Number((_b = process.env.SIGNIN_RATE_MAX) !== null && _b !== void 0 ? _b : 10);
const signinAttempts = new Map();
function rateLimit(ip) {
    const now = Date.now();
    const r = signinAttempts.get(ip);
    if (!r || now > r.resetAt) {
        signinAttempts.set(ip, { count: 1, resetAt: now + SIGNIN_LIMIT_WINDOW_MS });
        return { ok: true, remaining: SIGNIN_LIMIT_MAX - 1 };
    }
    r.count += 1;
    signinAttempts.set(ip, r);
    if (r.count > SIGNIN_LIMIT_MAX)
        return { ok: false, retryAfter: Math.ceil((r.resetAt - now) / 1000) };
    return { ok: true, remaining: SIGNIN_LIMIT_MAX - r.count };
}
function signAdminToken(payload) {
    var _a;
    if (!JWT_ADMIN_SECRET)
        throw new Error("JWT_ADMIN_SECRET not set");
    return jsonwebtoken_1.default.sign({ uid: payload.uid, role: (_a = payload.role) !== null && _a !== void 0 ? _a : "admin" }, JWT_ADMIN_SECRET, { expiresIn: "7d", issuer: "arkwork-admin", audience: "arkwork-admins" });
}
function setAdminCookie(res, token) {
    res.cookie(ADMIN_COOKIE, token, {
        httpOnly: true,
        sameSite: COOKIE_SAMESITE,
        secure: COOKIE_SECURE && !IS_LOCAL ? true : false,
        path: "/",
        maxAge: 7 * 24 * 60 * 60 * 1000,
    });
}
function clearAdminCookie(res) {
    res.clearCookie(ADMIN_COOKIE, { path: "/", httpOnly: true, sameSite: COOKIE_SAMESITE, secure: COOKIE_SECURE && !IS_LOCAL ? true : false });
}
/* POST /api/admin/signin */
router.post("/signin", async (req, res) => {
    var _a;
    try {
        const ip = req.headers['x-forwarded-for'] || req.ip || 'unknown';
        const rl = rateLimit(ip);
        if (!rl.ok) {
            res.setHeader("Retry-After", String(rl.retryAfter || 60));
            return res.status(429).json({ message: "Too many attempts. Try again later." });
        }
        const { usernameOrEmail, password } = (_a = req.body) !== null && _a !== void 0 ? _a : {};
        if (!usernameOrEmail || !password)
            return res.status(400).json({ message: "Invalid request" });
        // normalize username/email
        const input = String(usernameOrEmail).toLowerCase().trim();
        // resolve username: if email => map to user part OR use ADMIN_EMAILS env to map specific emails
        let usernameToFind = input.includes("@") ? input.split("@")[0] : input;
        const emailsEnv = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
        if (input.includes("@") && emailsEnv.includes(input) && process.env.ADMIN_USERNAME) {
            usernameToFind = process.env.ADMIN_USERNAME;
        }
        const admin = await prisma_1.prisma.admin.findUnique({ where: { username: usernameToFind } });
        const failure = "Email/Username atau password salah";
        if (!admin)
            return res.status(401).json({ message: failure });
        const ok = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!ok)
            return res.status(401).json({ message: failure });
        const token = signAdminToken({ uid: admin.id, role: "admin" });
        setAdminCookie(res, token);
        console.info(`[ADMIN][SIGNIN][OK] admin=${admin.id} ip=${ip}`);
        return res.json({ ok: true, admin: { id: admin.id, username: admin.username } });
    }
    catch (err) {
        console.error("[ADMIN][SIGNIN][ERROR]", err);
        return res.status(500).json({ message: "Internal server error" });
    }
});
/* GET /api/admin/me */
router.get("/me", async (req, res) => {
    var _a;
    try {
        const raw = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[ADMIN_COOKIE];
        if (!raw)
            return res.status(401).json({ message: "Unauthorized" });
        if (!JWT_ADMIN_SECRET)
            return res.status(500).json({ message: "Server misconfiguration" });
        try {
            const payload = jsonwebtoken_1.default.verify(raw, JWT_ADMIN_SECRET);
            if (!payload || payload.role !== "admin" || !payload.uid)
                return res.status(401).json({ message: "Unauthorized" });
            const admin = await prisma_1.prisma.admin.findUnique({ where: { id: payload.uid }, select: { id: true, username: true } });
            if (!admin)
                return res.status(401).json({ message: "Unauthorized" });
            return res.json({ id: admin.id, username: admin.username, role: "admin" });
        }
        catch (e) {
            return res.status(401).json({ message: "Invalid token" });
        }
    }
    catch (e) {
        console.error("[ADMIN][ME] error", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});
/* POST /api/admin/signout */
router.post("/signout", (_req, res) => {
    try {
        clearAdminCookie(res);
        return res.json({ ok: true });
    }
    catch (e) {
        console.error("[ADMIN][SIGNOUT] error", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});
exports.default = router;
