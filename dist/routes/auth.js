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
// backend/src/routes/auth.ts
const express_1 = require("express");
const client_1 = require("@prisma/client");
const zod_1 = require("zod");
const bcrypt = __importStar(require("bcryptjs"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const cookie_1 = require("cookie");
const router = (0, express_1.Router)();
const prisma = new client_1.PrismaClient();
const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
function signToken(p) {
    return jsonwebtoken_1.default.sign(p, JWT_SECRET, { expiresIn: "7d" });
}
function verifyToken(t) {
    return jsonwebtoken_1.default.verify(t, JWT_SECRET);
}
function setAuthCookie(res, token) {
    res.setHeader("Set-Cookie", (0, cookie_1.serialize)("token", token, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 60 * 60 * 24 * 7, // 7 hari
    }));
}
/** ============== Helpers (tanpa owner/member) ============== **/
async function resolveEmployerForUser(opts) {
    const { employerSlug } = opts;
    // 1) Jika slug diberikan → ambil by slug
    if (employerSlug) {
        const bySlug = await prisma.employer.findUnique({
            where: { slug: employerSlug },
            select: { id: true, slug: true, displayName: true, legalName: true },
        });
        if (bySlug)
            return bySlug;
    }
    // 2) Fallback: ambil satu employer pertama (urut terbaru)
    const first = await prisma.employer.findFirst({
        orderBy: { createdAt: "desc" }, // sesuaikan dengan field timestamp kamu; kalau tidak ada, hapus baris ini
        select: { id: true, slug: true, displayName: true, legalName: true },
    });
    return first || null;
}
/** ================= Validators ================= **/
const signupSchema = zod_1.z.object({
    email: zod_1.z.string().email(),
    password: zod_1.z.string().min(8),
    name: zod_1.z.string().min(2).max(50).optional(),
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
router.get("/", (_req, res) => {
    res.json({ message: "Auth route works!" });
});
// POST /auth/signup
router.post("/signup", async (req, res) => {
    try {
        const parsed = signupSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { email, password, name } = parsed.data;
        const exists = await prisma.user.findUnique({ where: { email } });
        if (exists)
            return res.status(409).json({ message: "Email sudah terdaftar" });
        const passwordHash = await bcrypt.hash(password, 10);
        const user = await prisma.user.create({
            data: { email, name, passwordHash },
            select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true },
        });
        const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
        const token = signToken({ uid: user.id, role: isAdmin ? "admin" : "user", eid: null });
        setAuthCookie(res, token);
        return res.status(201).json({ ...user, role: isAdmin ? "admin" : "user", employer: null });
    }
    catch (e) {
        console.error("SIGNUP ERROR:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});
// POST /auth/signin
router.post("/signin", async (req, res) => {
    try {
        const parsed = signinSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { email, password, employerSlug } = parsed.data;
        const user = await prisma.user.findUnique({ where: { email } });
        if (!user)
            return res.status(401).json({ message: "Email atau password salah" });
        const ok = await bcrypt.compare(password, user.passwordHash);
        if (!ok)
            return res.status(401).json({ message: "Email atau password salah" });
        // Tentukan employer aktif berdasar slug (kalau ada) atau fallback
        const employer = await resolveEmployerForUser({ employerSlug });
        const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
        const token = signToken({
            uid: user.id,
            role: isAdmin ? "admin" : "user",
            eid: employer?.id ?? null,
        });
        setAuthCookie(res, token);
        return res.json({
            id: user.id,
            email: user.email,
            name: user.name,
            photoUrl: user.photoUrl,
            cvUrl: user.cvUrl,
            role: isAdmin ? "admin" : "user",
            employer, // { id, slug, displayName, legalName } | null
        });
    }
    catch (e) {
        console.error("SIGNIN ERROR:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});
// POST /auth/signout
router.post("/signout", (_req, res) => {
    res.setHeader("Set-Cookie", (0, cookie_1.serialize)("token", "", {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        maxAge: 0,
    }));
    return res.status(204).end();
});
// GET /auth/me
router.get("/me", async (req, res) => {
    try {
        const raw = req.headers.cookie || "";
        const cookies = (0, cookie_1.parse)(raw);
        const token = cookies["token"];
        if (!token)
            return res.status(401).json({ message: "Unauthorized" });
        const payload = verifyToken(token); // { uid, role, eid }
        const user = await prisma.user.findUnique({
            where: { id: payload.uid },
            select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true },
        });
        if (!user)
            return res.status(401).json({ message: "Unauthorized" });
        let employer = null;
        if (payload.eid) {
            employer =
                (await prisma.employer.findUnique({
                    where: { id: payload.eid },
                    select: { id: true, slug: true, displayName: true, legalName: true },
                })) || null;
        }
        if (!employer) {
            employer = (await resolveEmployerForUser({}));
        }
        return res.json({ ...user, role: payload.role, employer });
    }
    catch (e) {
        console.error("ME ERROR:", e);
        return res.status(401).json({ message: "Invalid token" });
    }
});
// POST /auth/switch-employer
router.post("/switch-employer", async (req, res) => {
    try {
        const raw = req.headers.cookie || "";
        const cookies = (0, cookie_1.parse)(raw);
        const token = cookies["token"];
        if (!token)
            return res.status(401).json({ message: "Unauthorized" });
        const payload = verifyToken(token);
        const parsed = switchEmployerSchema.safeParse(req.body);
        if (!parsed.success)
            return res.status(400).json({ error: parsed.error.format() });
        const { employerId, employerSlug } = parsed.data;
        let employer = null;
        if (employerId) {
            employer = await prisma.employer.findUnique({
                where: { id: employerId },
                select: { id: true, slug: true, displayName: true, legalName: true },
            });
        }
        else if (employerSlug) {
            employer = await prisma.employer.findUnique({
                where: { slug: employerSlug },
                select: { id: true, slug: true, displayName: true, legalName: true },
            });
        }
        else {
            employer = await resolveEmployerForUser({});
        }
        if (!employer)
            return res.status(404).json({ message: "Employer tidak ditemukan" });
        const newToken = signToken({ uid: payload.uid, role: payload.role, eid: employer.id });
        setAuthCookie(res, newToken);
        return res.json({ ok: true, employer });
    }
    catch (e) {
        console.error("SWITCH EMPLOYER ERROR:", e);
        return res.status(500).json({ message: "Internal server error" });
    }
});
exports.default = router;
