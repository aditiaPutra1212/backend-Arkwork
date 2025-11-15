"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuthJwt = requireAuthJwt;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma"); // Sesuaikan path
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || '';
async function requireAuthJwt(req, res, next) {
    var _a;
    const token = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[ADMIN_COOKIE];
    if (!token) {
        return res.status(401).json({ message: 'Not authenticated' });
    }
    if (!JWT_ADMIN_SECRET) {
        console.error("JWT_ADMIN_SECRET is not set!");
        return res.status(500).json({ message: 'Server configuration error' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_ADMIN_SECRET);
        // Opsional tapi direkomendasikan: Cek apakah user masih ada di DB
        const admin = await prisma_1.prisma.admin.findUnique({
            where: { id: payload.uid },
            select: { id: true, username: true }, // Hanya ambil data yg perlu
        });
        if (!admin) {
            console.warn(`Admin ID ${payload.uid} from valid JWT not found in DB.`);
            // Mungkin user dihapus, bersihkan cookie & tolak
            res.clearCookie(ADMIN_COOKIE, { path: '/', httpOnly: true /* opsi lain harus sama */ });
            return res.status(401).json({ message: 'User not found' });
        }
        // Sukses! Simpan info admin di `req.admin` untuk handler berikutnya
        req.admin = {
            id: admin.id,
            username: admin.username,
            role: payload.role || 'admin', // Ambil role dari token
        };
        next(); // Lanjutkan ke handler berikutnya (misal requireAdmin atau route handler)
    }
    catch (error) {
        // Token tidak valid (kadaluarsa, salah secret, dll)
        console.error("JWT verification failed:", error);
        res.clearCookie(ADMIN_COOKIE, { path: '/', httpOnly: true /* opsi lain harus sama */ }); // Hapus cookie yg tidak valid
        return res.status(401).json({ message: 'Invalid or expired token' });
    }
}
