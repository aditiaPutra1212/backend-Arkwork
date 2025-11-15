"use strict";
// backend/src/services/employer.ts
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAvailability = checkAvailability;
exports.createAccount = createAccount;
exports.upsertProfile = upsertProfile;
exports.choosePlan = choosePlan;
exports.createDraftJob = createDraftJob;
exports.submitVerification = submitVerification;
// ▼▼▼ PERBAIKAN 1: Tambahkan .js pada import prisma ▼▼▼
const prisma_js_1 = require("../lib/prisma.js");
const zod_1 = require("zod");
// Jika enum Prisma sudah di-generate, boleh import untuk type-safety kuat:
// import { OnboardingStep, EmployerStatus } from '@prisma/client';
/* ======================= Helpers ======================= */
// ▼▼▼ PERBAIKAN 2: Ubah 'await import' menjadi 'require' ▼▼▼
const { hashPassword } = require('../lib/hash.js');
const slugify = (s) => s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'company';
async function ensureUniqueSlug(base) {
    const root = slugify(base);
    let slug = root;
    let i = 1;
    // eslint-disable-next-line no-constant-condition
    while (true) {
        const exist = await prisma_js_1.prisma.employer.findUnique({
            where: { slug },
            select: { id: true },
        });
        if (!exist)
            return slug;
        slug = `${root}-${i++}`;
    }
}
/* ======================= Schemas (service-level) ======================= */
const CheckAvailabilityInput = zod_1.z.object({
    slug: zod_1.z.string().optional(),
    email: zod_1.z.string().email().optional(),
});
const CreateAccountInput = zod_1.z.object({
    companyName: zod_1.z.string().min(2),
    displayName: zod_1.z.string().min(2),
    email: zod_1.z.string().email(),
    website: zod_1.z.string().url().optional(),
    password: zod_1.z.string().min(8),
});
const UpsertProfileInput = zod_1.z.object({
    industry: zod_1.z.string().optional(),
    size: zod_1.z.any().optional(), // jika mau ketat: z.nativeEnum(CompanySize).optional()
    foundedYear: zod_1.z.number().int().optional(),
    about: zod_1.z.string().optional(),
    logoUrl: zod_1.z.string().url().optional(),
    bannerUrl: zod_1.z.string().url().optional(),
    hqCity: zod_1.z.string().optional(),
    hqCountry: zod_1.z.string().optional(),
    linkedin: zod_1.z.string().url().optional(),
    instagram: zod_1.z.string().url().optional(),
    twitter: zod_1.z.string().url().optional(),
});
const ChoosePlanInput = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    planSlug: zod_1.z.string().min(1),
});
const CreateDraftJobInput = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    title: zod_1.z.string().min(2),
    description: zod_1.z.string().optional(),
    location: zod_1.z.string().optional(),
    employment: zod_1.z.string().optional(),
});
const SubmitVerificationInput = zod_1.z.object({
    employerId: zod_1.z.string().uuid(),
    note: zod_1.z.string().optional(),
    files: zod_1.z
        .array(zod_1.z.object({ url: zod_1.z.string().url(), type: zod_1.z.string().optional() }))
        .optional(),
});
/* ======================= Public API ======================= */
async function checkAvailability(params) {
    const input = CheckAvailabilityInput.parse(params);
    const out = {};
    if (input.slug) {
        const s = slugify(input.slug);
        out.slugTaken = !!(await prisma_js_1.prisma.employer.findUnique({
            where: { slug: s },
            select: { id: true },
        }));
    }
    if (input.email) {
        const email = input.email.toLowerCase();
        out.emailTaken = !!(await prisma_js_1.prisma.employerAdminUser.findUnique({
            where: { email },
            select: { id: true },
        }));
    }
    return out;
}
/**
 * createAccount
 * Membuat Employer + EmployerAdminUser di dalam transaksi.
 * Mengembalikan { employerId, slug }.
 */
async function createAccount(input) {
    const data = CreateAccountInput.parse(input);
    const email = data.email.toLowerCase();
    // Pastikan email belum dipakai
    const exist = await prisma_js_1.prisma.employerAdminUser.findUnique({
        where: { email },
        select: { id: true },
    });
    if (exist) {
        throw Object.assign(new Error('Email already used'), { status: 409, code: 'EMAIL_TAKEN' });
    }
    const slug = await ensureUniqueSlug(data.displayName);
    // ▼▼▼ PERBAIKAN 3: Hapus import duplikat. 'hashPassword' sudah di-import di atas (baris 11) ▼▼▼
    // const { hashPassword } = await import('../lib/hash');
    const passwordHash = await hashPassword(data.password);
    const result = await prisma_js_1.prisma.$transaction(async (tx) => {
        var _a;
        const employer = await tx.employer.create({
            data: {
                slug,
                legalName: data.companyName,
                displayName: data.displayName,
                website: (_a = data.website) !== null && _a !== void 0 ? _a : null,
                status: 'draft', // atau EmployerStatus.draft
                onboardingStep: 'PACKAGE', // start ke step berikut (atau 'PROFILE' sesuai flow)
            },
            select: { id: true },
        });
        await tx.employerAdminUser.create({
            data: {
                employerId: employer.id,
                email,
                passwordHash,
                isOwner: true,
                agreedTosAt: new Date(),
            },
            select: { id: true },
        });
        return { employerId: employer.id };
    });
    return { employerId: result.employerId, slug };
}
/**
 * upsertProfile
 * Menyimpan EmployerProfile lalu update onboardingStep -> PACKAGE (berikutnya pilih paket).
 */
async function upsertProfile(employerId, profile) {
    const body = UpsertProfileInput.parse(profile);
    await prisma_js_1.prisma.employerProfile.upsert({
        where: { employerId },
        update: body,
        create: { employerId, ...body },
    });
    await prisma_js_1.prisma.employer
        .update({
        where: { id: employerId },
        data: { onboardingStep: 'PACKAGE' }, // OnboardingStep.PACKAGE
    })
        .catch(() => { });
    return { ok: true };
}
/**
 * choosePlan
 * Buat subscription aktif untuk employer & set onboardingStep -> JOB.
 * Mencegah duplikat subscription aktif untuk plan yang sama.
 */
async function choosePlan(employerId, planSlug) {
    const { employerId: eid, planSlug: pslug } = ChoosePlanInput.parse({
        employerId,
        planSlug,
    });
    const plan = await prisma_js_1.prisma.plan.findUnique({
        where: { slug: pslug },
        select: { id: true },
    });
    if (!plan)
        throw Object.assign(new Error('Plan not found'), { status: 404 });
    await prisma_js_1.prisma.$transaction(async (tx) => {
        // Jika sudah ada subscription aktif untuk plan yang sama, skip
        const exist = await tx.subscription.findFirst({
            where: { employerId: eid, planId: plan.id, status: 'active' },
            select: { id: true },
        });
        if (!exist) {
            await tx.subscription.create({
                data: {
                    employerId: eid,
                    planId: plan.id,
                    status: 'active', // atau enum
                },
                select: { id: true },
            });
        }
        await tx.employer.update({
            where: { id: eid },
            data: { onboardingStep: 'JOB' }, // OnboardingStep.JOB
        });
    });
    return { ok: true };
}
/**
 * createDraftJob
 * Membuat satu draft job dan update onboardingStep -> VERIFY.
 */
async function createDraftJob(employerId, data) {
    const body = CreateDraftJobInput.parse({ employerId, ...data });
    const job = await prisma_js_1.prisma.$transaction(async (tx) => {
        const j = await tx.job.create({
            data: {
                employerId: body.employerId,
                title: body.title,
                description: body.description,
                location: body.location,
                employment: body.employment,
                isDraft: true,
                isActive: false,
            },
            select: { id: true, title: true },
        });
        await tx.employer.update({
            where: { id: body.employerId },
            data: { onboardingStep: 'VERIFY' }, // OnboardingStep.VERIFY
        });
        return j;
    });
    return { ok: true, jobId: job.id };
}
/**
 * submitVerification
 * Membuat VerificationRequest (+files) dan set onboardingStep -> DONE.
 */
async function submitVerification(employerId, note, files) {
    const body = SubmitVerificationInput.parse({ employerId, note, files });
    const vr = await prisma_js_1.prisma.$transaction(async (tx) => {
        var _a;
        const req = await tx.verificationRequest.create({
            data: { employerId: body.employerId, status: 'pending', note: body.note },
            select: { id: true },
        });
        if ((_a = body.files) === null || _a === void 0 ? void 0 : _a.length) {
            await tx.verificationFile.createMany({
                data: body.files.map((f) => ({
                    verificationId: req.id,
                    fileUrl: f.url,
                    fileType: f.type,
                })),
            });
        }
        await tx.employer.update({
            where: { id: body.employerId },
            data: { onboardingStep: 'DONE' }, // OnboardingStep.DONE
        });
        return req;
    });
    return { ok: true, verificationId: vr.id };
}
