// src/validators/employer.ts
import { z } from 'zod';
import { $Enums } from '@prisma/client';

/* ================= Helpers ================= */

// string opsional: trim lalu ubah '' => undefined
const optionalTrimmedString = z
  .string()
  .transform((v) => (typeof v === 'string' ? v.trim() : v))
  .optional()
  .or(z.literal('').transform(() => undefined));

// URL opsional yang fleksibel:
// - '' dianggap undefined (tidak error)
// - jika diisi tanpa http/https -> otomatis prepend 'https://'
// - validasi akhir tetap butuh pola URL dasar (tanpa spasi)
const optionalUrl = z
  .string()
  .transform((v) => (typeof v === 'string' ? v.trim() : v))
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((v) => {
    if (!v) return undefined;
    // auto prepend https:// bila user tidak tulis protokol
    if (!/^https?:\/\//i.test(v)) return `https://${v}`;
    return v;
  })
  .refine((v) => !v || /^https?:\/\/[^\s]+$/.test(v), {
    message: 'URL tidak valid',
  });

/* ================ Step 1: Akun & Perusahaan ================ */
export const Step1Schema = z
  .object({
    companyName: z.string().min(2, 'Nama perusahaan minimal 2 karakter'),
    displayName: z.string().min(2, 'Display name minimal 2 karakter'),
    email: z.string().email('Email tidak valid'),
    website: optionalUrl, // opsional & fleksibel
    password: z.string().min(8, 'Password minimal 8 karakter'),
    confirmPassword: z.string().min(8, 'Password minimal 8 karakter'),
    // harus true
    agree: z.boolean().refine((v) => v === true, {
      message: 'Anda harus menyetujui syarat & ketentuan',
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/* ================ Step 2: Profil Perusahaan ================ */
/* Catatan: disesuaikan dengan Prisma:
   EmployerProfile: { industry, size, foundedYear, about, logoUrl, bannerUrl, hqCity, hqCountry, linkedin, twitter, instagram }
   (tidak ada facebook/youtube di schema Prisma saat ini)
*/
export const Step2Schema = z.object({
  employerId: z.string().uuid('employerId harus UUID'),
  industry: optionalTrimmedString,
  size: z.nativeEnum($Enums.CompanySize).optional(),
  foundedYear: z
    .preprocess((v) => (typeof v === 'string' ? Number(v) : v), z.number().int().gte(1800).lte(new Date().getFullYear()))
    .optional(),
  about: z.string().max(5000, 'Maks 5000 karakter').optional(),
  hqCity: optionalTrimmedString,
  hqCountry: optionalTrimmedString,
  logoUrl: optionalUrl,
  bannerUrl: optionalUrl,

  // social (hanya yang ada di Prisma)
  linkedin: optionalUrl,
  instagram: optionalUrl,
  twitter: optionalUrl,
});

/* ================ Step 3: Paket/Plan ================ */
export const Step3Schema = z.object({
  employerId: z.string().uuid(),
  planSlug: z.string().min(1),
});

/* ================ Step 4: Lowongan Awal ================ */
export const Step4Schema = z.object({
  employerId: z.string().uuid(),
  title: z.string().min(3, 'Judul minimal 3 karakter'),
  description: optionalTrimmedString,
  location: optionalTrimmedString,
  employment: optionalTrimmedString,
});

/* ================ Step 5: Verifikasi ================ */
export const Step5Schema = z.object({
  employerId: z.string().uuid(),
  note: optionalTrimmedString,
  files: z
    .array(
      z.object({
        url: optionalUrl.transform((v) => {
          // untuk file bukti, tetap wajib URL jika ada item
          // kalau ingin benar-benar opsional, hapus refine di bawah
          return v;
        }),
        type: optionalTrimmedString,
      })
    )
    .default([]),
});

/* ================ Types ================ */
export type Step1Input = z.infer<typeof Step1Schema>;
export type Step2Input = z.infer<typeof Step2Schema>;
export type Step3Input = z.infer<typeof Step3Schema>;
export type Step4Input = z.infer<typeof Step4Schema>;
export type Step5Input = z.infer<typeof Step5Schema>;
