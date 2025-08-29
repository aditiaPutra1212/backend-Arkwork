import { z } from 'zod';
import { $Enums } from '@prisma/client';

/* ================= Helpers ================= */

/** Trim string ('' -> undefined) */
const optionalTrimmedString = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((v) => (typeof v === 'string' ? v.trim() : undefined))
  .optional();

/** URL opsional & fleksibel:
 * - '' / null / undefined => undefined
 * - tanpa http/https => otomatis `https://`
 * - izinkan `data:` (untuk logo/banner)
 */
const optionalUrl = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((raw) => {
    const v = (typeof raw === 'string' ? raw.trim() : '') || '';
    if (!v) return undefined;
    if (/^data:/i.test(v)) return v; // data URL (img base64) untuk logo/banner
    const hasProto = /^https?:\/\//i.test(v);
    const s = hasProto ? v : `https://${v}`;
    // validasi ringan (tanpa \s)
    if (!/^https?:\/\/[^\s]+$/i.test(s)) return undefined;
    return s;
  })
  .optional();

/* ================ Step 1: Akun & Perusahaan ================ */
export const Step1Schema = z
  .object({
    companyName: z.string().min(2, 'Nama perusahaan minimal 2 karakter'),
    displayName: z.string().min(2, 'Display name minimal 2 karakter'),
    email: z.string().email('Email tidak valid'),
    website: optionalUrl, // opsional & fleksibel
    password: z.string().min(8, 'Password minimal 8 karakter'),
    confirmPassword: z.string().min(8, 'Password minimal 8 karakter'),
    agree: z.boolean().refine((v) => v === true, {
      message: 'Anda harus menyetujui syarat & ketentuan',
    }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  })
  // biar field asing tidak bikin error
  .passthrough();

/* ================ Step 2: Profil Perusahaan ================ */
/** Diselaraskan dengan kolom EmployerProfile di Prisma:
 *  industry, size, foundedYear, about, logoUrl, bannerUrl,
 *  hqCity, hqCountry, linkedin, instagram, twitter
 */
export const Step2Schema = z
  .object({
    employerId: z.string().uuid('employerId harus UUID'),
    industry: optionalTrimmedString,
    size: z.nativeEnum($Enums.CompanySize).optional(),
    foundedYear: z
      .union([z.string(), z.number()])
      .transform((v) => (typeof v === 'string' ? Number(v) : v))
      .refine((n) => !n || (Number.isInteger(n) && n >= 1800 && n <= new Date().getFullYear()), {
        message: 'Tahun berdiri tidak valid',
      })
      .optional(),
    about: z.string().max(5000, 'Maks 5000 karakter').optional(),

    hqCity: optionalTrimmedString,
    hqCountry: optionalTrimmedString,

    logoUrl: optionalUrl,   // http(s) atau data:
    bannerUrl: optionalUrl,

    // sosial (yang ada di Prisma)
    linkedin: optionalUrl,
    instagram: optionalUrl,
    twitter: optionalUrl,

    // frontend bisa kirim ekstra (facebook/youtube/website), kita terima tapi diabaikan
    facebook: optionalUrl,
    youtube: optionalUrl,
    website: optionalUrl,
  })
  .passthrough();

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
        url: optionalUrl,         // opsional; kalau undefined itemnya bisa di-skip di service
        type: optionalTrimmedString,
      })
    )
    .optional()
    .default([]),
});

/* ================ Types ================ */
export type Step1Input = z.infer<typeof Step1Schema>;
export type Step2Input = z.infer<typeof Step2Schema>;
export type Step3Input = z.infer<typeof Step3Schema>;
export type Step4Input = z.infer<typeof Step4Schema>;
export type Step5Input = z.infer<typeof Step5Schema>;
