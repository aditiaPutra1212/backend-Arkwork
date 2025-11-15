// backend/src/routes/admin.ts
import { Router, Request, Response } from "express";
import { prisma } from "../lib/prisma";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";

const router = Router();

const IS_LOCAL = process.env.NODE_ENV !== "production";
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || "admin_token";
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || "";
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || (IS_LOCAL ? "lax" : "lax")) as 'lax'|'none'|'strict';
const COOKIE_SECURE = process.env.COOKIE_SECURE === 'true' || (!IS_LOCAL && COOKIE_SAMESITE === 'none');

if (!IS_LOCAL && !JWT_ADMIN_SECRET) {
  console.error("[FATAL] JWT_ADMIN_SECRET is required in production.");
}

// Very small in-memory rate limiter for signin attempts (dev only; replace with Redis in prod)
const SIGNIN_LIMIT_WINDOW_MS = Number(process.env.SIGNIN_RATE_WINDOW_MS ?? 60_000);
const SIGNIN_LIMIT_MAX = Number(process.env.SIGNIN_RATE_MAX ?? 10);
const signinAttempts = new Map<string, { count: number; resetAt: number }>();
function rateLimit(ip: string) {
  const now = Date.now();
  const r = signinAttempts.get(ip);
  if (!r || now > r.resetAt) {
    signinAttempts.set(ip, { count: 1, resetAt: now + SIGNIN_LIMIT_WINDOW_MS });
    return { ok: true, remaining: SIGNIN_LIMIT_MAX - 1 };
  }
  r.count += 1;
  signinAttempts.set(ip, r);
  if (r.count > SIGNIN_LIMIT_MAX) return { ok: false, retryAfter: Math.ceil((r.resetAt - now) / 1000) };
  return { ok: true, remaining: SIGNIN_LIMIT_MAX - r.count };
}

function signAdminToken(payload: { uid: string; role?: string }) {
  if (!JWT_ADMIN_SECRET) throw new Error("JWT_ADMIN_SECRET not set");
  return jwt.sign({ uid: payload.uid, role: payload.role ?? "admin" }, JWT_ADMIN_SECRET, { expiresIn: "7d", issuer: "arkwork-admin", audience: "arkwork-admins" });
}
function setAdminCookie(res: Response, token: string) {
  res.cookie(ADMIN_COOKIE, token, {
    httpOnly: true,
    sameSite: COOKIE_SAMESITE,
    secure: COOKIE_SECURE && !IS_LOCAL ? true : false,
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}
function clearAdminCookie(res: Response) {
  res.clearCookie(ADMIN_COOKIE, { path: "/", httpOnly: true, sameSite: COOKIE_SAMESITE, secure: COOKIE_SECURE && !IS_LOCAL ? true : false });
}

/* POST /api/admin/signin */
router.post("/signin", async (req: Request, res: Response) => {
  try {
    const ip = (req.headers['x-forwarded-for'] as string) || req.ip || 'unknown';
    const rl = rateLimit(ip);
    if (!rl.ok) {
      res.setHeader("Retry-After", String(rl.retryAfter || 60));
      return res.status(429).json({ message: "Too many attempts. Try again later." });
    }

    const { usernameOrEmail, password } = req.body ?? {};
    if (!usernameOrEmail || !password) return res.status(400).json({ message: "Invalid request" });

    // normalize username/email
    const input = String(usernameOrEmail).toLowerCase().trim();

    // resolve username: if email => map to user part OR use ADMIN_EMAILS env to map specific emails
    let usernameToFind = input.includes("@") ? input.split("@")[0] : input;
    const emailsEnv = (process.env.ADMIN_EMAILS || "").split(",").map(s => s.trim().toLowerCase()).filter(Boolean);
    if (input.includes("@") && emailsEnv.includes(input) && process.env.ADMIN_USERNAME) {
      usernameToFind = process.env.ADMIN_USERNAME;
    }

    const admin = await prisma.admin.findUnique({ where: { username: usernameToFind } });
    const failure = "Email/Username atau password salah";
    if (!admin) return res.status(401).json({ message: failure });

    const ok = await bcrypt.compare(password, admin.passwordHash);
    if (!ok) return res.status(401).json({ message: failure });

    const token = signAdminToken({ uid: admin.id, role: "admin" });
    setAdminCookie(res, token);

    console.info(`[ADMIN][SIGNIN][OK] admin=${admin.id} ip=${ip}`);
    return res.json({ ok: true, admin: { id: admin.id, username: admin.username } });
  } catch (err: any) {
    console.error("[ADMIN][SIGNIN][ERROR]", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/* GET /api/admin/me */
router.get("/me", async (req: Request, res: Response) => {
  try {
    const raw = (req as any).cookies?.[ADMIN_COOKIE];
    if (!raw) return res.status(401).json({ message: "Unauthorized" });

    if (!JWT_ADMIN_SECRET) return res.status(500).json({ message: "Server misconfiguration" });

    try {
      const payload = jwt.verify(raw, JWT_ADMIN_SECRET) as any;
      if (!payload || payload.role !== "admin" || !payload.uid) return res.status(401).json({ message: "Unauthorized" });

      const admin = await prisma.admin.findUnique({ where: { id: payload.uid }, select: { id: true, username: true } });
      if (!admin) return res.status(401).json({ message: "Unauthorized" });

      return res.json({ id: admin.id, username: admin.username, role: "admin" });
    } catch (e: any) {
      return res.status(401).json({ message: "Invalid token" });
    }
  } catch (e: any) {
    console.error("[ADMIN][ME] error", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

/* POST /api/admin/signout */
router.post("/signout", (_req: Request, res: Response) => {
  try {
    clearAdminCookie(res);
    return res.json({ ok: true });
  } catch (e) {
    console.error("[ADMIN][SIGNOUT] error", e);
    return res.status(500).json({ message: "Internal server error" });
  }
});

export default router;
