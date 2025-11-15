"use strict";
// backend/src/controllers/auth.controller.ts
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.verifyToken = exports.resetPassword = exports.forgotPassword = void 0;
const prisma_1 = require("../lib/prisma");
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// Impor helper baru Anda
const mailer_1 = require("../lib/mailer");
const hash_1 = require("../lib/hash");
const JWT_SECRET = process.env.JWT_RESET_SECRET || 'SECRET_RESET_DEFAULT';
// Fungsi untuk Lupa Password (DIPERBAIKI)
const forgotPassword = async (req, res) => {
    const { email } = req.body;
    try {
        const user = await prisma_1.prisma.user.findUnique({
            where: { email },
        });
        if (!user) {
            return res.status(200).json({ message: 'Jika email terdaftar, link reset akan dikirim.' });
        }
        const token = jsonwebtoken_1.default.sign({ userId: user.id }, JWT_SECRET, {
            expiresIn: '1h',
        });
        const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;
        // --- PERBAIKAN: Gunakan template email cantik dari mailer.ts ---
        await (0, mailer_1.sendPasswordResetEmail)(user.email, user.name, resetLink);
        // --- BATAS PERBAIKAN ---
        return res.status(200).json({ message: 'Link reset password telah dikirim ke email Anda.' });
    }
    catch (error) {
        console.error(error);
        return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
};
exports.forgotPassword = forgotPassword;
// Fungsi untuk Reset Password (DIPERBAIKI agar cocok dengan frontend)
const resetPassword = async (req, res) => {
    // 'newPassword' harus cocok dengan apa yang dikirim frontend (Fix 1.B)
    const { token, newPassword } = req.body;
    if (!token || !newPassword) {
        return res.status(400).json({ message: 'Token dan password baru diperlukan' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const hashedPassword = await (0, hash_1.hashPassword)(newPassword);
        await prisma_1.prisma.user.update({
            where: {
                id: payload.userId,
            },
            data: {
                passwordHash: hashedPassword,
            },
        });
        return res.status(200).json({ message: 'Password berhasil direset.' });
    }
    catch (error) {
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
        }
        if (error instanceof Error && error.code === 'P2025') {
            return res.status(404).json({ message: 'User tidak ditemukan' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
};
exports.resetPassword = resetPassword;
// --- FUNGSI BARU UNTUK MEMPERBAIKI LINK MATI ---
const verifyToken = async (req, res) => {
    const { token } = req.params;
    if (!token) {
        return res.status(400).json({ message: 'Token diperlukan' });
    }
    try {
        // Verifikasi token. Jika gagal, ini akan melempar error
        jsonwebtoken_1.default.verify(token, JWT_SECRET);
        return res.status(200).json({ message: 'Token valid.' });
    }
    catch (error) {
        // Tangani jika token invalid atau expired
        if (error instanceof jsonwebtoken_1.default.JsonWebTokenError || error instanceof jsonwebtoken_1.default.TokenExpiredError) {
            return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
        }
        console.error(error);
        return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
    }
};
exports.verifyToken = verifyToken;
