"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step5Schema = exports.Step4Schema = exports.Step3Schema = exports.Step2Schema = exports.Step1Schema = void 0;
// src/validators/employer.ts
const zod_1 = require("zod");
const client_1 = require("@prisma/client");
/* ================= Helpers ================= */
// string opsional: trim lalu ubah '' => undefined
const optionalTrimmedString = zod_1.z
    .string()
    .transform((v) => (typeof v === 'string' ? v.trim() : v))
    .optional()
    .or(zod_1.z.literal('').transform(() => undefined));
// URL opsional yang fleksibel:
// - '' dianggap undefined (tidak error)
// - jika diisi tanpa http/https -> otomatis prepend 'https://'
// - validasi akhir tetap butuh pola URL dasar (tanpa spasi)
const optionalUrl = zod_1.z
    .string()
    .transform((v) => (typeof v === 'string' ? v.trim() : v))
    .optional()
    .or(zod_1.z.literal('').transform(() => undefined))
    .transform((v) => {
    if (!v)
        return undefined;
    // auto prepend https:// bila user tidak tulis protokol
    if (!/^https?:\/\//i.test(v))
        return `https://${v}`;
    return v;
})
    .refine((v) => !v || /^https?:\/\/[^\s]+$/.test(v), {
    message: 'URL tidak valid',
});
/* ================ Step 1: Akun & Perusahaan ================ */
exports.Step1Schema = zod_1.z
    .object({
    companyName: zod_1.z.string().min(2, 'Nama perusahaan minimal 2 karakter'),
    displayName: zod_1.z.string().min(2, 'Display name minimal 2 karakter'),
    email: zod_1.z.string().email('Email tidak valid'),
    website: optionalUrl, // opsional & fleksibel
    password: zod_1.z.string().min(8, 'Password minimal 8 karakter'),
    confirmPassword: zod_1.z.string().min(8, 'Password minimal 8 karakter'),
    // harus true
    agree: zod_1.z.boolean().refine((v) => v === true, {
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
exports.Step2Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid('employerId harus UUID'),
    industry: optionalTrimmedString,
    size: zod_1.z.nativeEnum(client_1.$Enums.CompanySize).optional(),
    foundedYear: zod_1.z
        .preprocess((v) => (typeof v === 'string' ? Number(v) : v), zod_1.z.number().int().gte(1800).lte(new Date().getFullYear()))
        .optional(),
    about: zod_1.z.string().max(5000, 'Maks 5000 karakter').optional(),
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
exports.Step3Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    planSlug: zod_1.z.string().min(1),
});
/* ================ Step 4: Lowongan Awal ================ */
exports.Step4Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(3, 'Judul minimal 3 karakter'),
    description: optionalTrimmedString,
    location: optionalTrimmedString,
    employment: optionalTrimmedString,
});
/* ================ Step 5: Verifikasi ================ */
exports.Step5Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    note: optionalTrimmedString,
    files: zod_1.z
        .array(zod_1.z.object({
        url: optionalUrl.transform((v) => {
            // untuk file bukti, tetap wajib URL jika ada item
            // kalau ingin benar-benar opsional, hapus refine di bawah
            return v;
        }),
        type: optionalTrimmedString,
    }))
        .default([]),
});
