"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.Step5Schema = exports.Step4Schema = exports.Step3Schema = exports.Step2Schema = exports.Step1Schema = void 0;
const zod_1 = require("zod");
exports.Step1Schema = zod_1.z.object({
    companyName: zod_1.z.string().min(2),
    displayName: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    website: zod_1.z.string().url().optional().or(zod_1.z.literal('').transform(() => undefined)),
    password: zod_1.z.string().min(8),
    confirmPassword: zod_1.z.string().min(8),
    agree: zod_1.z.literal(true)
}).refine(v => v.password === v.confirmPassword, { message: 'Passwords do not match', path: ['confirmPassword'] });
exports.Step2Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    industry: zod_1.z.string().optional(),
    size: zod_1.z.enum(['_1_10', '_11_50', '_51_200', '_201_500', '_501_1000', '_1001_5000', '_5001_10000', '_10000plus']).optional(),
    foundedYear: zod_1.z.number().int().gte(1800).lte(new Date().getFullYear()).optional(),
    about: zod_1.z.string().max(5000).optional(),
    hqCity: zod_1.z.string().optional(),
    hqCountry: zod_1.z.string().optional(),
    logoUrl: zod_1.z.string().url().optional(),
    bannerUrl: zod_1.z.string().url().optional(),
});
exports.Step3Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    planSlug: zod_1.z.string(),
});
exports.Step4Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(3),
    description: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    employment: zod_1.z.string().optional(),
});
exports.Step5Schema = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    note: zod_1.z.string().optional(),
    files: zod_1.z.array(zod_1.z.object({ url: zod_1.z.string().url(), type: zod_1.z.string().optional() })).default([])
});
