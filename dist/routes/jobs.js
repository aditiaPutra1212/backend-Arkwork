"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.jobsRouter = void 0;
const express_1 = require("express");
const prisma_1 = require("../utils/prisma");
exports.jobsRouter = (0, express_1.Router)();
/**
 * GET /api/jobs
 * Query:
 *  - active=1 (opsional) -> hanya job aktif (isActive true & isDraft false)
 */
exports.jobsRouter.get('/jobs', async (req, res) => {
    try {
        const onlyActive = String(req.query.active || '') === '1';
        const jobs = await prisma_1.prisma.job.findMany({
            where: onlyActive ? { isActive: true, isDraft: false } : undefined,
            orderBy: { createdAt: 'desc' },
            include: {
                employer: {
                    select: {
                        displayName: true,
                        profile: { select: { logoUrl: true } },
                    },
                },
            },
        });
        const data = jobs.map((j) => ({
            id: j.id,
            title: j.title,
            location: j.location ?? '',
            employment: j.employment ?? '',
            description: j.description ?? '',
            postedAt: j.createdAt.toISOString(),
            company: j.employer?.displayName ?? 'Company',
            logoUrl: j.employer?.profile?.logoUrl ?? null,
            isActive: j.isActive,
        }));
        res.json({ ok: true, data });
    }
    catch (e) {
        console.error('GET /api/jobs error:', e);
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * (Opsional) GET /api/employer/jobs
 * Ambil job milik employer tertentu (dev: boleh lewat query ?employerId=... / env)
 */
exports.jobsRouter.get('/employer/jobs', async (req, res) => {
    try {
        const employerId = req.query.employerId || process.env.DEV_EMPLOYER_ID;
        if (!employerId) {
            return res
                .status(401)
                .json({ ok: false, error: 'employerId tidak tersedia' });
        }
        const jobs = await prisma_1.prisma.job.findMany({
            where: { employerId },
            orderBy: { createdAt: 'desc' },
            include: {
                employer: {
                    select: {
                        displayName: true,
                        profile: { select: { logoUrl: true } },
                    },
                },
            },
        });
        const data = jobs.map((j) => ({
            id: j.id,
            title: j.title,
            location: j.location ?? '',
            employment: j.employment ?? '',
            description: j.description ?? '',
            postedAt: j.createdAt.toISOString(),
            company: j.employer?.displayName ?? 'Company',
            logoUrl: j.employer?.profile?.logoUrl ?? null,
            isActive: j.isActive,
            isDraft: j.isDraft,
        }));
        res.json({ ok: true, data });
    }
    catch (e) {
        console.error('GET /api/employer/jobs error:', e);
        res.status(500).json({ ok: false, error: e?.message || 'Internal error' });
    }
});
/**
 * POST /api/employer/jobs
 * Body: { title, location?, employment?, description?, isDraft?, employerId?, logoDataUrl? }
 * Ambil employerId dari session (TODO). DEV: pakai body.employerId atau ENV DEV_EMPLOYER_ID.
 */
exports.jobsRouter.post('/employer/jobs', async (req, res) => {
    try {
        const { title, location, employment, description, isDraft, employerId: bodyEmployerId, logoDataUrl, } = req.body || {};
        if (!title || typeof title !== 'string') {
            return res.status(400).json({ ok: false, error: 'title wajib diisi' });
        }
        // TODO: pakai session di produksi
        const employerId = bodyEmployerId || process.env.DEV_EMPLOYER_ID;
        if (!employerId) {
            return res
                .status(401)
                .json({
                ok: false,
                error: 'Tidak ada employerId (login sebagai employer dulu)',
            });
        }
        // Jika ada logo (data URL) dikirim, simpan ke profil employer
        if (logoDataUrl && typeof logoDataUrl === 'string') {
            await prisma_1.prisma.employer.update({
                where: { id: employerId },
                data: {
                    profile: {
                        upsert: {
                            create: { logoUrl: logoDataUrl },
                            update: { logoUrl: logoDataUrl },
                        },
                    },
                },
            });
        }
        const employer = await prisma_1.prisma.employer.findUnique({
            where: { id: employerId },
            select: { displayName: true, profile: { select: { logoUrl: true } } },
        });
        const job = await prisma_1.prisma.job.create({
            data: {
                employerId,
                title,
                description: description ?? null,
                location: location ?? null,
                employment: employment ?? null,
                isDraft: Boolean(isDraft),
                isActive: !Boolean(isDraft), // jika bukan draft -> aktif
            },
        });
        return res.json({
            ok: true,
            data: {
                id: job.id,
                title: job.title,
                location: job.location,
                employment: job.employment,
                description: job.description,
                postedAt: job.createdAt.toISOString(),
                company: employer?.displayName ?? 'Company',
                logoUrl: employer?.profile?.logoUrl ?? null,
                isActive: job.isActive,
            },
        });
    }
    catch (e) {
        console.error('POST /api/employer/jobs error:', e);
        return res
            .status(500)
            .json({ ok: false, error: e?.message || 'Internal error' });
    }
});
