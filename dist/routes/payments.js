"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/payments.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
// ===== Auth placeholder (sesuaikan dengan sistemmu) =====
function requireAuth(_req, _res, next) {
    return next();
}
function getMaybeEmployerId(req) {
    const anyReq = req;
    return anyReq?.user?.employerId ?? anyReq?.session?.employerId ?? req.body?.employerId;
}
const r = (0, express_1.Router)();
/* ================= LIST SUBSCRIPTIONS (sebagai pengganti payments) ================= */
r.get('/', async (req, res, next) => {
    try {
        const take = Math.min(Math.max(Number(req.query.take ?? 20), 1), 100);
        const cursor = req.query.cursor ?? undefined;
        const items = await prisma_1.prisma.subscription.findMany({
            take,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                status: true,
                createdAt: true,
                updatedAt: true,
                employer: { select: { id: true, slug: true, displayName: true, legalName: true } },
                plan: { select: { id: true, slug: true, name: true, amount: true, currency: true, interval: true } },
            },
        });
        const nextCursor = items.length === take ? items[items.length - 1].id : null;
        res.json({ items, nextCursor });
    }
    catch (e) {
        next(e);
    }
});
/* ================= PUBLIC PLANS (signup step) ================= */
r.get('/plans', async (_req, res, next) => {
    try {
        const plans = await prisma_1.prisma.plan.findMany({
            where: { active: true },
            orderBy: [{ amount: 'asc' }, { id: 'asc' }],
            select: {
                id: true,
                slug: true,
                name: true,
                description: true,
                amount: true, // Int di schema
                currency: true,
                interval: true,
                active: true,
            },
        });
        res.json(plans);
    }
    catch (e) {
        next(e);
    }
});
/* ================= CHECKOUT SEDERHANA: bikin subscription langsung ================= */
r.post('/checkout', requireAuth, async (req, res) => {
    try {
        const { planId, employerId: employerIdBody } = (req.body ?? {});
        const employerId = employerIdBody ?? getMaybeEmployerId(req);
        if (!planId || !employerId)
            return res.status(400).json({ error: 'planId dan employerId diperlukan' });
        const plan = await prisma_1.prisma.plan.findFirst({
            where: { OR: [{ id: planId }, { slug: planId }] },
            select: { id: true, amount: true, currency: true },
        });
        if (!plan)
            return res.status(404).json({ error: 'Plan not found' });
        const sub = await prisma_1.prisma.subscription.create({
            data: {
                employerId: String(employerId),
                planId: plan.id,
                status: 'active', // schema string
            },
            select: { id: true, employerId: true, planId: true, status: true, createdAt: true },
        });
        // response mirip transaksi (tanpa Midtrans)
        res.json({
            ok: true,
            subscriptionId: sub.id,
            employerId: sub.employerId,
            planId: sub.planId,
            status: sub.status,
            amount: plan.amount,
            currency: plan.currency ?? 'IDR',
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'Internal server error' });
    }
});
/* ================= Webhook Midtrans (placeholder) ================= */
r.post('/midtrans/notify', async (_req, res) => {
    // tidak ada tabel Payment → noop
    res.status(200).json({ ok: true });
});
exports.default = r;
