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
const router = (0, express_1.Router)();
/* ===================== Cookie helpers ===================== */
const EMP_COOKIE = "emp_session";
const SESSION_HOURS = 12;
function makeCookie(sessionId) {
    return (0, cookie_1.serialize)(EMP_COOKIE, sessionId, {
        httpOnly: true,
        secure: true, // required with SameSite=None; allowed on localhost
        sameSite: "none", // allow cross-site requests to include cookie
        path: "/",
        maxAge: SESSION_HOURS * 60 * 60,
    });
}
function clearCookie() {
    return (0, cookie_1.serialize)(EMP_COOKIE, "", {
        httpOnly: true,
        secure: true,
        sameSite: "none",
        path: "/",
        maxAge: 0,
    });
}
function readSessionIdFromReq(req) {
    var _a;
    try {
        const sid = (0, cookie_1.parse)(((_a = req.headers) === null || _a === void 0 ? void 0 : _a.cookie) || "")[EMP_COOKIE];
        return sid || null;
    }
    catch {
        return null;
    }
}
/* ===================== Helpers ===================== */
function norm(v) {
    return String(v !== null && v !== void 0 ? v : "").trim();
}
function normEmail(v) {
    return String(v !== null && v !== void 0 ? v : "").trim().toLowerCase();
}
/* ===================== POST /signin ===================== */
/**
 * Body dapat { email, password } atau { usernameOrEmail, password }.
 * Lookup ke employer_admin_users via email (insensitive) atau fullName (insensitive).
 */
router.post("/signin", async (req, res) => {
    var _a, _b, _c, _d, _e;
    try {
        const rawIdentifier = (_d = (_b = (_a = req.body) === null || _a === void 0 ? void 0 : _a.usernameOrEmail) !== null && _b !== void 0 ? _b : (_c = req.body) === null || _c === void 0 ? void 0 : _c.email) !== null && _d !== void 0 ? _d : "";
        const password = norm((_e = req.body) === null || _e === void 0 ? void 0 : _e.password);
        if (!rawIdentifier || !password) {
            return res.status(400).json({ ok: false, error: "MISSING_CREDENTIALS" });
        }
        // Normalisasi: email lowercase, username tetap trim
        const identifier = norm(rawIdentifier);
        const identifierEmail = normEmail(rawIdentifier);
        const admin = await prisma_1.prisma.employerAdminUser.findFirst({
            where: {
                OR: [
                    // email dicocokkan insensitive
                    { email: { equals: identifierEmail, mode: "insensitive" } },
                    // sebagai fallback, izinkan login via fullName (username) insensitive
                    { fullName: { equals: identifier, mode: "insensitive" } },
                ],
            },
            select: {
                id: true,
                email: true,
                passwordHash: true,
                employerId: true,
                employer: { select: { id: true, slug: true, displayName: true, status: true, isVerified: true } },
            },
        });
        if (!admin || !admin.passwordHash) {
            // Samakan pesan agar tidak bisa enumerate
            return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
        }
        const passOk = await bcryptjs_1.default.compare(password, admin.passwordHash);
        if (!passOk) {
            return res.status(401).json({ ok: false, error: "INVALID_CREDENTIALS" });
        }
        // Pastikan employer-nya ada & aktif
        const employer = await prisma_1.prisma.employer.findUnique({
            where: { id: admin.employerId },
            select: { id: true, slug: true, displayName: true, status: true, isVerified: true },
        });
        if (!employer) {
            return res.status(401).json({ ok: false, error: "NO_EMPLOYER" });
        }
        // (Opsional) jika mau guard status tertentu, aktifkan ini:
        // if (employer.status !== 'active') {
        //   return res.status(403).json({ ok: false, error: "EMPLOYER_INACTIVE" });
        // }
        // Buat session
        const now = Date.now();
        const session = await prisma_1.prisma.session.create({
            data: {
                userId: null, // jangan konflik dengan User FK
                employerId: employer.id,
                createdAt: new Date(now),
                lastSeenAt: new Date(now),
                expiresAt: new Date(now + SESSION_HOURS * 60 * 60 * 1000),
                ip: req.ip,
                userAgent: req.get("user-agent") || "",
            },
            select: { id: true },
        });
        res.setHeader("Set-Cookie", makeCookie(session.id));
        return res.json({
            ok: true,
            employer: { id: employer.id, slug: employer.slug, displayName: employer.displayName },
            admin: { id: admin.id, email: admin.email },
        });
    }
    catch (e) {
        console.error("[EMP-AUTH] /signin error:", e);
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});
/* ===================== POST /signout ===================== */
router.post("/signout", async (req, res) => {
    try {
        const sid = readSessionIdFromReq(req);
        if (sid) {
            await prisma_1.prisma.session.updateMany({
                where: { id: sid, revokedAt: null },
                data: { revokedAt: new Date() },
            });
        }
    }
    catch (e) {
        console.warn("[EMP-AUTH] /signout revoke warn:", e);
    }
    res.setHeader("Set-Cookie", clearCookie());
    return res.status(204).end();
});
/* ===================== GET /me ===================== */
router.get("/me", async (req, res) => {
    var _a, _b;
    try {
        const sid = readSessionIdFromReq(req);
        if (!sid)
            return res.status(401).json({ ok: false, error: "NO_SESSION" });
        const s = await prisma_1.prisma.session.findUnique({
            where: { id: sid },
            select: { employerId: true, revokedAt: true, expiresAt: true },
        });
        if (!s || s.revokedAt || !s.employerId || (s.expiresAt && s.expiresAt < new Date())) {
            return res.status(401).json({ ok: false, error: "NO_SESSION" });
        }
        const employer = await prisma_1.prisma.employer.findUnique({
            where: { id: s.employerId },
            select: {
                id: true,
                slug: true,
                displayName: true,
                legalName: true,
                website: true,
                profile: { select: { logoUrl: true } },
            },
        });
        if (!employer) {
            return res.status(404).json({ ok: false, error: "EMPLOYER_NOT_FOUND" });
        }
        const admin = await prisma_1.prisma.employerAdminUser.findFirst({
            where: { employerId: s.employerId },
            orderBy: { isOwner: "desc" },
            select: { id: true, email: true, fullName: true, isOwner: true },
        });
        return res.json({
            ok: true,
            role: "employer",
            employer: {
                id: employer.id,
                slug: employer.slug,
                displayName: employer.displayName,
                legalName: employer.legalName,
                website: employer.website,
                logoUrl: (_b = (_a = employer.profile) === null || _a === void 0 ? void 0 : _a.logoUrl) !== null && _b !== void 0 ? _b : null,
            },
            admin: admin !== null && admin !== void 0 ? admin : null,
        });
    }
    catch (e) {
        console.error("[EMP-AUTH] /me error:", e);
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});
/* ===================== (Optional) POST /renew ===================== */
router.post("/renew", async (req, res) => {
    try {
        const sid = readSessionIdFromReq(req);
        if (!sid)
            return res.status(401).json({ ok: false, error: "NO_SESSION" });
        const s = await prisma_1.prisma.session.findUnique({
            where: { id: sid },
            select: { id: true, revokedAt: true, expiresAt: true },
        });
        if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < new Date())) {
            return res.status(401).json({ ok: false, error: "NO_SESSION" });
        }
        const now = Date.now();
        const newExp = new Date(now + SESSION_HOURS * 60 * 60 * 1000);
        await prisma_1.prisma.session.update({
            where: { id: s.id },
            data: { lastSeenAt: new Date(now), expiresAt: newExp },
            select: { id: true },
        });
        res.setHeader("Set-Cookie", makeCookie(s.id));
        return res.json({ ok: true });
    }
    catch (e) {
        console.error("[EMP-AUTH] /renew error:", e);
        return res.status(500).json({ ok: false, error: "INTERNAL_ERROR" });
    }
});
exports.default = router;
