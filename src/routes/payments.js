"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/payments.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const midtrans_1 = require("../services/midtrans");
/* ================= Auth placeholder (sesuaikan dengan sistemmu) ================= */
function requireAuth(req, _res, next) {
    // contoh: req.user = { id: 'user-123', employerId: 'emp-456' }
    return next();
}
function getMaybeUserId(req) {
    var _a, _b, _c, _d, _e, _f;
    const anyReq = req;
    return (_e = (_b = (_a = anyReq === null || anyReq === void 0 ? void 0 : anyReq.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : (_d = (_c = anyReq === null || anyReq === void 0 ? void 0 : anyReq.session) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : (_f = req.body) === null || _f === void 0 ? void 0 : _f.userId;
}
const r = (0, express_1.Router)();
/* ================= Utils: serialize angka aman ================= */
function toNumberSafe(v) {
    if (v == null)
        return null;
    if (typeof v === 'number')
        return v;
    if (typeof (v === null || v === void 0 ? void 0 : v.toNumber) === 'function')
        return v.toNumber(); // Prisma Decimal
    if (typeof v === 'bigint')
        return Number(v); // BigInt
    if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))
        return Number(v);
    return Number(v);
}
/* ================= LIST (admin/inbox) ================= */
r.get('/', async (req, res, next) => {
    var _a, _b, _c;
    try {
        const take = Math.min(Math.max(Number((_a = req.query.take) !== null && _a !== void 0 ? _a : 20), 1), 100);
        const cursor = (_b = req.query.cursor) !== null && _b !== void 0 ? _b : undefined;
        const status = (_c = req.query.status) === null || _c === void 0 ? void 0 : _c.trim();
        const where = status ? { status } : undefined;
        const rows = await prisma_1.prisma.payment.findMany({
            where,
            take,
            ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
            orderBy: { createdAt: 'desc' },
            select: {
                id: true,
                orderId: true,
                status: true, // settlement | pending | capture | cancel | expire | deny | refund | failure
                method: true,
                grossAmount: true, // Decimal/BigInt
                currency: true,
                createdAt: true,
                transactionId: true,
                plan: { select: { id: true, slug: true, name: true, interval: true } },
                employer: { select: { id: true, displayName: true, legalName: true, slug: true } },
            },
        });
        const items = rows.map((p) => {
            var _a, _b, _c, _d, _e, _f, _g;
            return ({
                id: p.id,
                orderId: p.orderId,
                status: p.status,
                method: (_a = p.method) !== null && _a !== void 0 ? _a : null,
                grossAmount: (_b = toNumberSafe(p.grossAmount)) !== null && _b !== void 0 ? _b : 0,
                currency: (_c = p.currency) !== null && _c !== void 0 ? _c : 'IDR',
                createdAt: (_f = (_e = (_d = p.createdAt) === null || _d === void 0 ? void 0 : _d.toISOString) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : new Date(p.createdAt).toISOString(),
                transactionId: (_g = p.transactionId) !== null && _g !== void 0 ? _g : null,
                plan: p.plan
                    ? {
                        id: p.plan.id,
                        slug: p.plan.slug,
                        name: p.plan.name,
                        interval: p.plan.interval,
                    }
                    : null,
                employer: p.employer
                    ? {
                        id: p.employer.id,
                        displayName: p.employer.displayName,
                        legalName: p.employer.legalName,
                        slug: p.employer.slug,
                    }
                    : null,
            });
        });
        const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
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
                amount: true, // Decimal/BigInt
                currency: true,
                interval: true,
                active: true,
                priceId: true,
                // paymentLinkUrl: true, // aktifkan jika ada kolomnya di schema
            },
        });
        const serialized = plans.map((p) => {
            var _a;
            return ({
                ...p,
                amount: (_a = toNumberSafe(p.amount)) !== null && _a !== void 0 ? _a : 0,
            });
        });
        res.json(serialized);
    }
    catch (e) {
        next(e);
    }
});
/* ================= CHECKOUT (buat transaksi Snap) ================= */
r.post('/checkout', requireAuth, async (req, res) => {
    var _a, _b, _c;
    try {
        const { planId, employerId, customer, enabledPayments } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
        if (!planId)
            return res.status(400).json({ error: 'Invalid params: planId required' });
        const maybeUserId = getMaybeUserId(req);
        const tx = await (0, midtrans_1.createSnapForPlan)({
            planId,
            userId: maybeUserId !== null && maybeUserId !== void 0 ? maybeUserId : null,
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
            amount: plan ? (_b = toNumberSafe(plan.amount)) !== null && _b !== void 0 ? _b : undefined : undefined,
            currency: (_c = plan === null || plan === void 0 ? void 0 : plan.currency) !== null && _c !== void 0 ? _c : 'IDR',
        });
    }
    catch (e) {
        res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'Internal server error' });
    }
});
/* ================= Webhook Midtrans ================= */
r.post('/midtrans/notify', async (req, res) => {
    try {
        const result = await (0, midtrans_1.handleMidtransNotification)(req.body);
        if ((result === null || result === void 0 ? void 0 : result.ok) === false) {
            console.warn('Midtrans notify rejected:', result);
        }
    }
    catch (e) {
        console.error('Midtrans notify error:', e);
    }
    // selalu 200 agar Midtrans tidak spam retry
    res.status(200).json({ ok: true });
});
/* ================= Detail by orderId (polling) ================= */
r.get('/:orderId', requireAuth, async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g;
    try {
        const p = await prisma_1.prisma.payment.findUnique({
            where: { orderId: req.params.orderId },
            select: {
                orderId: true,
                status: true,
                method: true,
                grossAmount: true,
                currency: true,
                createdAt: true,
                transactionId: true,
            },
        });
        if (!p)
            return res.status(404).json({ error: 'Not found' });
        res.json({
            orderId: p.orderId,
            status: p.status,
            method: (_a = p.method) !== null && _a !== void 0 ? _a : null,
            grossAmount: (_b = toNumberSafe(p.grossAmount)) !== null && _b !== void 0 ? _b : 0,
            currency: (_c = p.currency) !== null && _c !== void 0 ? _c : 'IDR',
            createdAt: (_f = (_e = (_d = p.createdAt) === null || _d === void 0 ? void 0 : _d.toISOString) === null || _e === void 0 ? void 0 : _e.call(_d)) !== null && _f !== void 0 ? _f : new Date(p.createdAt).toISOString(),
            transactionId: (_g = p.transactionId) !== null && _g !== void 0 ? _g : null,
        });
    }
    catch (e) {
        next(e);
    }
});
exports.default = r;
