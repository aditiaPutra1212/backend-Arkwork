// backend/src/routes/auth.ts
import { Router, Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";
import * as bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { serialize, parse } from "cookie";

const router = Router();
const prisma = new PrismaClient();

const JWT_SECRET = process.env.JWT_SECRET || "dev-secret-change-me";
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || "")
  .split(",")
  .map((s) => s.trim().toLowerCase())
  .filter(Boolean);

/** ================= JWT ================= **/
type JWTPayload = {
  uid: string;               // user id
  role: "admin" | "user";
  eid?: string | null;       // employerId aktif (opsional)
};

function signToken(p: JWTPayload) {
  return jwt.sign(p, JWT_SECRET, { expiresIn: "7d" });
}
function verifyToken(t: string) {
  return jwt.verify(t, JWT_SECRET) as JWTPayload;
}
function setAuthCookie(res: Response, token: string) {
  res.setHeader(
    "Set-Cookie",
    serialize("token", token, {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    })
  );
}

/** ============== Helpers (tanpa owner/member) ============== **/
async function resolveEmployerForUser(opts: { employerSlug?: string | null }) {
  const { employerSlug } = opts;

  // 1) Jika slug diberikan → ambil by slug
  if (employerSlug) {
    const bySlug = await prisma.employer.findUnique({
      where: { slug: employerSlug },
      select: { id: true, slug: true, displayName: true, legalName: true },
    });
    if (bySlug) return bySlug;
  }

  // 2) Fallback: ambil satu employer pertama (urut terbaru)
  const first = await prisma.employer.findFirst({
    orderBy: { createdAt: "desc" }, // sesuaikan dengan field timestamp kamu; kalau tidak ada, hapus baris ini
    select: { id: true, slug: true, displayName: true, legalName: true },
  });
  return first || null;
}

/** ================= Validators ================= **/
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(50).optional(),
});

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  employerSlug: z.string().min(1).optional(), // opsional: pilih employer saat login
});

const switchEmployerSchema = z.object({
  employerId: z.string().min(1).optional(),
  employerSlug: z.string().min(1).optional(),
});

/** ================= Routes ================= **/

// GET /auth
router.get("/", (_req, res) => {
  res.json({ message: "Auth route works!" });
});

// POST /auth/signup
router.post("/signup", async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { email, password, name } = parsed.data;

    const exists = await prisma.user.findUnique({ where: { email } });
    if (exists) return res.status(409).json({ message: "Email sudah terdaftar" });

    const passwordHash = await bcrypt.hash(password, 10);
    const user = await prisma.user.create({
      data: { email, name, passwordHash },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true },
    });

    const isAdmin = ADMIN_EMAILS.includes(user.email.toLowerCase());
    const token = signToken({ uid: user.id, role: isAdmin ? "admin" : "user", eid: null });
    setAuthCookie(res, token);

    return res.status(201).json({ ...user, role: isAdmin ? "admin" : "user", employer: null });
  } catch (e) {
    console.error("SIGNUP ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/signin
router.post("/signin", async (req: Request, res: Response) => {
  try {
    const parsed = signinSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { email, password, employerSlug } = parsed.data;

    const user = await prisma.user.findUnique({ where: { email } });
    if (!user) return res.status(401).json({ message: "Email atau password salah" });

    const ok = await bcrypt.compare(password, user.passwordHash);
    if (!ok) return res.status(401).json({ message: "Email atau password salah" });

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
  } catch (e) {
    console.error("SIGNIN ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/signout
router.post("/signout", (_req: Request, res: Response) => {
  res.setHeader(
    "Set-Cookie",
    serialize("token", "", {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      path: "/",
      maxAge: 0,
    })
  );
  return res.status(204).end();
});

// GET /auth/me
router.get("/me", async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || "";
    const cookies = parse(raw);
    const token = cookies["token"];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = verifyToken(token); // { uid, role, eid }
    const user = await prisma.user.findUnique({
      where: { id: payload.uid },
      select: { id: true, email: true, name: true, photoUrl: true, cvUrl: true },
    });
    if (!user) return res.status(401).json({ message: "Unauthorized" });

    let employer = null as null | { id: string; slug: string; displayName: string | null; legalName: string | null };

    if (payload.eid) {
      employer =
        (await prisma.employer.findUnique({
          where: { id: payload.eid },
          select: { id: true, slug: true, displayName: true, legalName: true },
        })) || null;
    }
    if (!employer) {
      employer = (await resolveEmployerForUser({})) as any;
    }

    return res.json({ ...user, role: payload.role, employer });
  } catch (e) {
    console.error("ME ERROR:", e);
    return res.status(401).json({ message: "Invalid token" });
  }
});

// POST /auth/switch-employer
router.post("/switch-employer", async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || "";
    const cookies = parse(raw);
    const token = cookies["token"];
    if (!token) return res.status(401).json({ message: "Unauthorized" });

    const payload = verifyToken(token);
    const parsed = switchEmployerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() });

    const { employerId, employerSlug } = parsed.data;

    let employer = null as { id: string; slug: string; displayName: string | null; legalName: string | null } | null;

    if (employerId) {
      employer = await prisma.employer.findUnique({
        where: { id: employerId },
        select: { id: true, slug: true, displayName: true, legalName: true },
      });
    } else if (employerSlug) {
      employer = await prisma.employer.findUnique({
        where: { slug: employerSlug },
        select: { id: true, slug: true, displayName: true, legalName: true },
      });
    } else {
      employer = await resolveEmployerForUser({});
    }

    if (!employer) return res.status(404).json({ message: "Employer tidak ditemukan" });

    const newToken = signToken({ uid: payload.uid, role: payload.role, eid: employer.id });
    setAuthCookie(res, newToken);

    return res.json({ ok: true, employer });
  } catch (e) {
    console.error("SWITCH EMPLOYER ERROR:", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;