"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/payments.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const midtrans_1 = require("../services/midtrans");
// ===== Auth placeholder (sesuaikan dengan sistemmu) =====
function requireAuth(req, _res, next) {
    // contoh: req.user = { id: 'user-123', employerId: 'emp-456' }
    return next();
}
function getMaybeUserId(req) {
    const anyReq = req;
    return anyReq?.user?.id ?? anyReq?.session?.user?.id ?? req.body?.userId;
}
const r = (0, express_1.Router)();
/* ================= LIST (admin/inbox) ================= */
r.get('/', async (req, res, next) => {
    try {
        const take = Math.min(Math.max(Number(req.query.take ?? 20), 1), 100);
        const cursor = req.query.cursor ?? undefined;
        const status = req.query.status?.trim();
        const where = status ? { status } : undefined;
        const items = await prisma_1.prisma.payment.findMany({
            where,
            take,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orderId: true,
                status: true,
                method: true,
                grossAmount: true,
                currency: true,
                createdAt: true,
                transactionId: true,
                redirectUrl: true,
                token: true,
                plan: { select: { id: true, slug: true, name: true, interval: true } },
                employer: { select: { id: true, displayName: true, legalName: true, slug: true } },
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
                amount: true, // bisa BigInt di DB
                currency: true,
                interval: true,
                active: true,
                priceId: true, // gunakan ini untuk Payment Link ID (opsional)
                // OPTIONAL: payment link URL penuh, aktifkan hanya jika kolom ini memang ada di schema
                // paymentLinkUrl: true,
            },
        });
        // kirim amount sebagai number agar JSON valid saat kolomnya BigInt
        const serialized = plans.map(p => ({ ...p, amount: Number(p.amount) }));
        res.json(serialized);
    }
    catch (e) {
        next(e);
    }
});
/* ================= CHECKOUT (buat transaksi Snap) ================= */
r.post('/checkout', requireAuth, async (req, res) => {
    try {
        const { planId, employerId, customer, enabledPayments } = (req.body ?? {});
        if (!planId)
            return res.status(400).json({ error: 'Invalid params: planId required' });
        // userId boleh kosong saat alur signup
        const maybeUserId = getMaybeUserId(req);
        const tx = await (0, midtrans_1.createSnapForPlan)({
            planId,
            userId: maybeUserId ?? null,
            employerId,
            customer,
            enabledPayments,
        });
        // isi nominal utk UI (optional)
        const plan = await prisma_1.prisma.plan.findFirst({
            where: { OR: [{ id: planId }, { slug: planId }] },
            select: { amount: true, currency: true },
        });
        res.json({
            token: tx.token,
            redirect_url: tx.redirect_url,
            orderId: tx.order_id,
            amount: plan ? Number(plan.amount) : undefined,
            currency: plan?.currency ?? 'IDR',
        });
    }
    catch (e) {
        res.status(500).json({ error: e?.message || 'Internal server error' });
    }
});
/* ================= Webhook Midtrans ================= */
r.post('/midtrans/notify', async (req, res) => {
    try {
        const result = await (0, midtrans_1.handleMidtransNotification)(req.body);
        if (result?.ok === false) {
            console.warn('Midtrans notify rejected:', result);
        }
    }
    catch (e) {
        console.error('Midtrans notify error:', e);
    }
    // selalu 200 agar Midtrans tidak spam retry
    res.status(200).json({ ok: true });
});
/* ================= Detail by orderId ================= */
r.get('/:orderId', requireAuth, async (req, res, next) => {
    try {
        const pay = await prisma_1.prisma.payment.findUnique({ where: { orderId: req.params.orderId } });
        if (!pay)
            return res.status(404).json({ error: 'Not found' });
        res.json(pay);
    }
    catch (e) {
        next(e);
    }
});
exports.default = r;
