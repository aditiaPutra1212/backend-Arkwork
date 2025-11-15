// src/routes/admin-tenders.ts

import { Router, Request, Response, NextFunction } from "express";
import { PrismaClient, Prisma } from "@prisma/client";
// ==========================================================
// PERBAIKAN:
// 1. Impor disamakan dengan 'index.ts'
// 2. Ekstensi .js dihapus
// ==========================================================
import { authRequired, adminRequired } from "../middleware/role";
import { prisma as sharedPrisma } from "../lib/prisma"; // <-- .js dihapus
// ==========================================================

// fallback to local if above not present (keamanan: gunakan shared client)
const prisma: PrismaClient = (sharedPrisma as any) || new PrismaClient();

const router = Router();

/* ---------------- helpers ---------------- */
function toInt(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? Math.trunc(n) : def;
}
function toDocs(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map((s) => s.trim()).filter(Boolean);
  if (typeof v === "string") {
    return v.split(",").map((s) => s.trim()).filter(Boolean);
  }
  return [];
}

/* sanitize output tender row */
function sanitizeTenderOutput(t: any) {
  if (!t) return t;
  return {
    ...t,
    // budgetUSD sudah string karena middleware global
    deadline: t.deadline ? (t.deadline instanceof Date ? t.deadline.toISOString() : String(t.deadline)) : null,
    createdAt: t.createdAt ? (t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt)) : null,
    updatedAt: t.updatedAt ? (t.updatedAt instanceof Date ? t.updatedAt.toISOString() : String(t.updatedAt)) : null,
  };
}

/* ---------------- Protect all admin routes ----------------
    Menggunakan middleware JWT
*/
// ==========================================================
// PERBAIKAN: Menggunakan nama middleware yang benar
// ==========================================================
router.use(authRequired, adminRequired); // Pastikan urutan benar
// ==========================================================

/* -----------------------------------------------------------
 * Create tender (ADMIN ONLY)
 * POST /
 * ---------------------------------------------------------*/
router.post("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    // Ambil info admin dari req.admin yang di-set oleh middleware
    const adminId = req.admin?.id ?? "unknown";
    const adminUsername = req.admin?.username ?? "unknown";
    const adminIp = req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";

    const {
      title,
      buyer,
      sector,
      location,
      status,
      contract,
      budgetUSD, // Ini 'number' (berisi IDR) dari frontend
      description,
      documents,
      deadline,
    } = req.body ?? {};

    // ▼▼▼ PERUBAHAN: Tambahkan 'deadline' ke validasi ▼▼▼
    if (!title || !buyer || !sector || !status || !contract || !deadline) {
      return res.status(400).json({ message: "Missing required fields: title/buyer/sector/status/contract/deadline" });
    }
    // ▲▲▲ SELESAI PERUBAHAN ▲▲▲

    // budget input flexible: string like "1.000.000" or number -> BigInt
    const parseToBigInt = (v: unknown): bigint => {
      if (v === undefined || v === null) return BigInt(0);
      if (typeof v === "bigint") return v;
      if (typeof v === "number") return BigInt(Math.max(0, Math.round(v)));
      if (typeof v === "string") {
        const clean = v.replace(/[^\d-]/g, "");
        const n = Number(clean || 0);
        return BigInt(Math.max(0, Math.round(isNaN(n) ? 0 : n)));
      }
      return BigInt(0);
    };

    const created = await prisma.tender.create({
      data: {
        title: String(title),
        buyer: String(buyer),
        sector: sector as any,
        location: String(location ?? ""),
        status: status as any,
        contract: contract as any,
        budgetUSD: parseToBigInt(budgetUSD) as any, // Konversi number (IDR) ke BigInt
        description: description !== undefined ? String(description ?? "") : undefined,
        documents: documents !== undefined ? toDocs(documents) : undefined,
        
        // ▼▼▼ PERUBAHAN: 'deadline' sekarang wajib ada ▼▼▼
        deadline: new Date(deadline),
        // ▲▲▲ SELESAI PERUBAHAN ▲▲▲
      },
    });

    console.info(`[ADMIN][TENDER][CREATE] admin=${adminId}(${adminUsername}) ip=${adminIp} tender=${created.id}`);

    // Middleware global akan handle BigInt to string
    return res.status(201).json(created);
  } catch (err: any) {
    console.error("Create tender error:", err);
    next(err); // Teruskan ke global error handler
  }
});

/* -----------------------------------------------------------
 * List (ADMIN ONLY)
 * GET /
 * ---------------------------------------------------------*/
router.get("/", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const items = await prisma.tender.findMany({
      orderBy: { createdAt: "desc" }, // Sesuai dengan frontend
    });

    return res.json(items.map(sanitizeTenderOutput));

  } catch (err: any) {
    console.error("List tenders error:", err);
    next(err); // Teruskan ke global error handler
  }
});

/* -----------------------------------------------------------
 * Get detail (ADMIN ONLY)
 * GET /:id
 * ---------------------------------------------------------*/
router.get("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const item = await prisma.tender.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ message: "Not found" });

    return res.json(sanitizeTenderOutput(item));
  } catch (err: any) {
    console.error("Get tender error:", err);
    next(err); // Teruskan ke global error handler
  }
});

/* -----------------------------------------------------------
 * Update (ADMIN ONLY)
 * PUT /:id
 * ---------------------------------------------------------*/
router.put("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.admin?.id ?? "unknown";
    const adminUsername = req.admin?.username ?? "unknown";
    const adminIp = req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";

    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    const {
      title,
      buyer,
      sector,
      location,
      status,
      contract,
      budgetUSD, // Ini 'number' (IDR) dari frontend
      description,
      documents,
      deadline,
    } = req.body ?? {};
    
    // Gunakan parser yang sama dengan POST untuk konsistensi
    const parseToBigInt = (v: unknown): bigint => {
      if (v === undefined || v === null) return BigInt(0);
      if (typeof v === "bigint") return v;
      if (typeof v === "number") return BigInt(Math.max(0, Math.round(v)));
      if (typeof v === "string") {
        const clean = v.replace(/[^\d-]/g, "");
        const n = Number(clean || 0);
        return BigInt(Math.max(0, Math.round(isNaN(n) ? 0 : n)));
      }
      return BigInt(0);
    };

    // (TIDAK BERUBAH) - 'undefined' di sini aman untuk update
    const data: Prisma.TenderUpdateInput = {
      title: String(title),
      buyer: String(buyer),
      sector: sector as any,
      location: String(location),
      status: status as any,
      contract: contract as any,
      description: String(description ?? ""),
      documents: toDocs(documents),
      deadline: deadline ? new Date(deadline) : undefined,
      budgetUSD: parseToBigInt(budgetUSD), // Konversi number (IDR) ke BigInt
    };

    const updated = await prisma.tender.update({ where: { id }, data });

    console.info(`[ADMIN][TENDER][UPDATE] admin=${adminId}(${adminUsername}) ip=${adminIp} tender=${updated.id}`);

    // Middleware global akan handle BigInt
    return res.json(updated);
  } catch (err: any) {
    console.error("Update tender error:", err);
    if (err?.code === "P2025") return res.status(404).json({ message: "Not found" });
    next(err); // Teruskan ke global error handler
  }
});

/* -----------------------------------------------------------
 * Delete (ADMIN ONLY)
 * DELETE /:id
 * ---------------------------------------------------------*/
router.delete("/:id", async (req: Request, res: Response, next: NextFunction) => {
  try {
    const adminId = req.admin?.id ?? "unknown";
    const adminUsername = req.admin?.username ?? "unknown";
    const adminIp = req.ip || (req.headers["x-forwarded-for"] as string) || "unknown";

    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: "Invalid id" });

    // check existence first (gives nicer error)
    const existing = await prisma.tender.findUnique({ where: { id } });
    if (!existing) return res.status(404).json({ message: "Not found" });

    await prisma.tender.delete({ where: { id } });

    console.info(`[ADMIN][TENDER][DELETE] admin=${adminId}(${adminUsername}) ip=${adminIp} tender=${id}`);

    // Ini sudah benar, frontend 'expectJson: false' cocok dengan 204
    return res.status(204).end();
  } catch (err: any) {
    console.error("Delete tender error:", err);
    if (err?.code === "P2025") return res.status(404).json({ message: "Not found" });
    next(err); // Teruskan ke global error handler
  }
});

export default router;