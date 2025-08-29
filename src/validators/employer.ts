import { z } from 'zod';
import { $Enums } from '@prisma/client';

/* ---------- helpers ---------- */
const optionalTrimmedString = z
  .string()
  .transform((v) => (typeof v === 'string' ? v.trim() : v))
  .optional()
  .or(z.literal('').transform(() => undefined));

const optionalUrl = z
  .string()
  .transform((v) => (typeof v === 'string' ? v.trim() : v))
  .optional()
  .or(z.literal('').transform(() => undefined))
  .transform((v) => {
    if (!v) return undefined;
    if (!/^https?:\/\//i.test(v)) return `https://${v}`;
    return v;
  })
  .refine((v) => !v || /^https?:\/\/[^\s]+$/.test(v), { message: 'URL tidak valid' });

/* ---------- Step 1 ---------- */
export const Step1Schema = z
  .object({
    companyName: z.string().min(2),
    displayName: z.string().min(2),
    email: z.string().email(),
    website: optionalUrl,
    password: z.string().min(8),
    confirmPassword: z.string().min(8),
    agree: z.boolean().refine((v) => v === true, { message: 'Anda harus menyetujui syarat & ketentuan' }),
  })
  .refine((v) => v.password === v.confirmPassword, {
    message: 'Passwords do not match',
    path: ['confirmPassword'],
  });

/* ---------- Step 2 ---------- */
export const Step2Schema = z.object({
  employerId: z.string().uuid(),
  industry: optionalTrimmedString,
  size: z.nativeEnum($Enums.CompanySize).optional(),
  foundedYear: z.preprocess((v) => (typeof v === 'string' ? Number(v) : v),
    z.number().int().gte(1800).lte(new Date().getFullYear())).optional(),
  about: z.string().max(5000).optional(),
  hqCity: optionalTrimmedString,
  hqCountry: optionalTrimmedString,
  logoUrl: optionalUrl,
  bannerUrl: optionalUrl,
  linkedin: optionalUrl,
  instagram: optionalUrl,
  twitter: optionalUrl,
});

/* ---------- Step 3 ---------- */
export const Step3Schema = z.object({
  employerId: z.string().uuid(),
  planSlug: z.string().min(1),
});

/* ---------- Step 4 ---------- */
export const Step4Schema = z.object({
  employerId: z.string().uuid(),
  title: z.string().min(3),
  description: optionalTrimmedString,
  location: optionalTrimmedString,
  employment: optionalTrimmedString,
});

/* ---------- Step 5 ---------- */
export const Step5Schema = z.object({
  employerId: z.string().uuid(),
  note: optionalTrimmedString,
  files: z.array(z.object({ url: optionalUrl, type: optionalTrimmedString })).default([]),
});

export type Step1Input = z.infer<typeof Step1Schema>;
export type Step2Input = z.infer<typeof Step2Schema>;
export type Step3Input = z.infer<typeof Step3Schema>;
export type Step4Input = z.infer<typeof Step4Schema>;
export type Step5Input = z.infer<typeof Step5Schema>;
