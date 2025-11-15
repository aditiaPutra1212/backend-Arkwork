// backend/src/controllers/auth.controller.ts

import { Request, Response } from 'express';
import { prisma } from '../lib/prisma';
import jwt from 'jsonwebtoken';
// Impor helper baru Anda
import { sendPasswordResetEmail } from '../lib/mailer'; 
import { hashPassword } from '../lib/hash';

const JWT_SECRET = process.env.JWT_RESET_SECRET || 'SECRET_RESET_DEFAULT';

// Fungsi untuk Lupa Password (DIPERBAIKI)
export const forgotPassword = async (req: Request, res: Response) => {
  const { email } = req.body;

  try {
    const user = await prisma.user.findUnique({
      where: { email },
    });

    if (!user) {
      return res.status(200).json({ message: 'Jika email terdaftar, link reset akan dikirim.' });
    }

    const token = jwt.sign({ userId: user.id }, JWT_SECRET, {
      expiresIn: '1h', 
    });

    const resetLink = `http://localhost:3000/auth/reset-password?token=${token}`;

    // --- PERBAIKAN: Gunakan template email cantik dari mailer.ts ---
    await sendPasswordResetEmail(user.email, user.name, resetLink);
    // --- BATAS PERBAIKAN ---

    return res.status(200).json({ message: 'Link reset password telah dikirim ke email Anda.' });

  } catch (error) {
    console.error(error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};

// Fungsi untuk Reset Password (DIPERBAIKI agar cocok dengan frontend)
export const resetPassword = async (req: Request, res: Response) => {
  // 'newPassword' harus cocok dengan apa yang dikirim frontend (Fix 1.B)
  const { token, newPassword } = req.body; 

  if (!token || !newPassword) {
    return res.status(400).json({ message: 'Token dan password baru diperlukan' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: string };
    const hashedPassword = await hashPassword(newPassword);

    await prisma.user.update({
      where: {
        id: payload.userId,
      },
      data: {
        passwordHash: hashedPassword, 
      },
    });

    return res.status(200).json({ message: 'Password berhasil direset.' });

  } catch (error) {
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
    }
    if (error instanceof Error && (error as any).code === 'P2025') {
       return res.status(404).json({ message: 'User tidak ditemukan' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};


// --- FUNGSI BARU UNTUK MEMPERBAIKI LINK MATI ---
export const verifyToken = async (req: Request, res: Response) => {
  const { token } = req.params; 

  if (!token) {
    return res.status(400).json({ message: 'Token diperlukan' });
  }

  try {
    // Verifikasi token. Jika gagal, ini akan melempar error
    jwt.verify(token, JWT_SECRET);
    return res.status(200).json({ message: 'Token valid.' });

  } catch (error) {
    // Tangani jika token invalid atau expired
    if (error instanceof jwt.JsonWebTokenError || error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({ message: 'Token tidak valid atau sudah kedaluwarsa' });
    }
    console.error(error);
    return res.status(500).json({ message: 'Terjadi kesalahan pada server' });
  }
};