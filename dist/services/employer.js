"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.checkAvailability = checkAvailability;
exports.createAccount = createAccount;
exports.upsertProfile = upsertProfile;
exports.choosePlan = choosePlan;
exports.createDraftJob = createDraftJob;
exports.submitVerification = submitVerification;
// src/services/employer.ts
const prisma_1 = require("../lib/prisma");
const hash_1 = require("../lib/hash");
async function checkAvailability(params) {
    const { slug, email } = params;
    const checks = {};
    if (slug) {
        checks.slugTaken = !!(await prisma_1.prisma.employer.findUnique({
            where: { slug },
            select: { id: true },
        }));
    }
    if (email) {
        checks.emailTaken = !!(await prisma_1.prisma.employerAdminUser.findUnique({
            where: { email },
            select: { id: true },
        }));
    }
    return checks;
}
async function createAccount(input) {
    const base = input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'company';
    let slug = base, i = 1;
    while (await prisma_1.prisma.employer.findUnique({
        where: { slug },
        select: { id: true },
    })) {
        slug = `${base}-${i++}`;
    }
    const passwordHash = await (0, hash_1.hashPassword)(input.password);
    const result = await prisma_1.prisma.$transaction(async (tx) => {
        const employer = await tx.employer.create({
            data: {
                slug,
                legalName: input.companyName,
                displayName: input.displayName,
                website: input.website,
                status: 'draft',
            },
            select: { id: true },
        });
        await tx.employerAdminUser.create({
            data: {
                employerId: employer.id,
                email: input.email,
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
async function upsertProfile(employerId, profile) {
    await prisma_1.prisma.employerProfile.upsert({
        where: { employerId },
        update: profile,
        create: { employerId, ...profile },
    });
    // tidak ada kolom onboardingStep di schema → tidak update apa-apa
    return { ok: true };
}
async function choosePlan(employerId, planSlug) {
    const plan = await prisma_1.prisma.plan.findUnique({
        where: { slug: planSlug },
        select: { id: true },
    });
    if (!plan)
        throw { status: 404, message: 'Plan not found' };
    await prisma_1.prisma.subscription.create({
        data: {
            employerId,
            planId: plan.id,
            status: 'active',
        },
        select: { id: true },
    });
    return { ok: true };
}
async function createDraftJob(employerId, data) {
    const job = await prisma_1.prisma.job.create({
        data: { employerId, ...data, isDraft: true, isActive: false },
        select: { id: true },
    });
    return { ok: true, jobId: job.id };
}
async function submitVerification(employerId, note, files) {
    const vr = await prisma_1.prisma.$transaction(async (tx) => {
        const req = await tx.verificationRequest.create({
            data: { employerId, status: 'pending', note },
            select: { id: true },
        });
        if (files?.length) {
            await tx.verificationFile.createMany({
                data: files.map((f) => ({ verificationId: req.id, fileUrl: f.url, fileType: f.type })),
            });
        }
        return req;
    });
    return { ok: true, verificationId: vr.id };
}
