"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/payments.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const midtrans_1 = require("../services/midtrans");
const billing_1 = require("../services/billing");
/* ================= Auth placeholder ================= */
function requireAuth(_req, _res, next) {
    return next();
}
function getMaybeUserId(req) {
    var _a, _b, _c, _d, _e, _f;
    const anyReq = req;
    return (_e = (_b = (_a = anyReq === null || anyReq === void 0 ? void 0 : anyReq.user) === null || _a === void 0 ? void 0 : _a.id) !== null && _b !== void 0 ? _b : (_d = (_c = anyReq === null || anyReq === void 0 ? void 0 : anyReq.session) === null || _c === void 0 ? void 0 : _c.user) === null || _d === void 0 ? void 0 : _d.id) !== null && _e !== void 0 ? _e : (_f = req.body) === null || _f === void 0 ? void 0 : _f.userId;
}
const r = (0, express_1.Router)();
/* ================= Utils ================= */
function toNumberSafe(v) {
    if (v == null)
        return null;
    if (typeof v === 'number')
        return v;
    if (typeof (v === null || v === void 0 ? void 0 : v.toNumber) === 'function')
        return v.toNumber(); // Prisma Decimal
    if (typeof v === 'bigint')
        return Number(v);
    if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v))
        return Number(v);
    return Number(v);
}
const looksEmail = (s) => !!s && /^\S+@\S+\.\S+$/.test(String(s).trim());
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
                status: true,
                method: true,
                grossAmount: true,
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
                plan: p.plan ? { id: p.plan.id, slug: p.plan.slug, name: p.plan.name, interval: p.plan.interval } : null,
                employer: p.employer
                    ? { id: p.employer.id, displayName: p.employer.displayName, legalName: p.employer.legalName, slug: p.employer.slug }
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
/* ================= PUBLIC PLANS ================= */
r.get('/plans', async (_req, res, next) => {
    try {
        const plans = await prisma_1.prisma.plan.findMany({
            where: { active: true },
            orderBy: [{ amount: 'asc' }, { id: 'asc' }],
            select: {
                id: true, slug: true, name: true, description: true, amount: true, currency: true,
                interval: true, active: true, priceId: true, trialDays: true,
            },
        });
        res.json(plans.map((p) => { var _a; return ({ ...p, amount: (_a = toNumberSafe(p.amount)) !== null && _a !== void 0 ? _a : 0 }); }));
    }
    catch (e) {
        next(e);
    }
});
/**
 * STEP 3 pilih paket (tangani trial/gratis)
 * Body: { employerId, planSlug, contact?: { email?: string; name?: string } }
 */
r.post('/employers/step3', async (req, res, next) => {
    var _a, _b;
    try {
        const { employerId, planSlug, contact } = req.body;
        console.log('[payments/step3] in →', { employerId, planSlug, contact });
        if (!employerId || !planSlug)
            return res.status(400).json({ error: 'employerId & planSlug required' });
        const employer = await prisma_1.prisma.employer.findUnique({
            where: { id: employerId },
            select: { id: true, displayName: true, slug: true },
        });
        if (!employer)
            return res.status(404).json({ error: 'Employer not found' });
        const plan = await prisma_1.prisma.plan.findUnique({ where: { slug: planSlug } });
        if (!plan || !plan.active)
            return res.status(400).json({ error: 'Plan not available' });
        // --- Helper: pastikan ada minimal satu admin (pakai email dari form kalau belum ada)
        async function ensureAtLeastOneAdmin() {
            const admins = await prisma_1.prisma.employerAdminUser.findMany({
                where: { employerId },
                select: { email: true },
            });
            let emails = admins.map((a) => a.email).filter(looksEmail);
            if (emails.length === 0 && looksEmail(contact === null || contact === void 0 ? void 0 : contact.email)) {
                const email = contact.email.trim().toLowerCase();
                await prisma_1.prisma.employerAdminUser.create({
                    data: { employerId, email, name: (contact === null || contact === void 0 ? void 0 : contact.name) || 'Admin' },
                });
                emails = [email];
                console.log('[payments/step3] created admin fallback →', email);
            }
            emails = Array.from(new Set(emails.map((e) => e.toLowerCase().trim())));
            console.log('[payments/step3] recipients →', emails);
            return emails;
        }
        // ====== TRIAL
        if (((_a = plan.trialDays) !== null && _a !== void 0 ? _a : 0) > 0) {
            await ensureAtLeastOneAdmin();
            const { trialEndsAt } = await (0, billing_1.startTrial)({
                employerId,
                planId: plan.id,
                trialDays: plan.trialDays,
            });
            await prisma_1.prisma.employer.update({
                where: { id: employerId },
                data: { onboardingStep: 'VERIFY' },
            });
            console.log('[payments/step3] result → TRIAL', { trialEndsAt });
            return res.json({ ok: true, mode: 'trial', trialEndsAt: new Date(trialEndsAt).toISOString() });
        }
        // ====== GRATIS (amount == 0)
        const amount = (_b = toNumberSafe(plan.amount)) !== null && _b !== void 0 ? _b : 0;
        if (amount <= 0) {
            await ensureAtLeastOneAdmin();
            const { premiumUntil } = await (0, billing_1.activatePremium)({
                employerId,
                planId: plan.id,
                interval: plan.interval || 'month',
            });
            await prisma_1.prisma.employer.update({
                where: { id: employerId },
                data: { onboardingStep: 'VERIFY' },
            });
            console.log('[payments/step3] result → FREE_ACTIVE', { premiumUntil });
            return res.json({ ok: true, mode: 'free_active', premiumUntil: new Date(premiumUntil).toISOString() });
        }
        // ====== BERBAYAR & tanpa trial → checkout
        await prisma_1.prisma.employer.update({
            where: { id: employerId },
            data: { currentPlanId: plan.id, onboardingStep: 'VERIFY' },
        });
        await ensureAtLeastOneAdmin(); // supaya email dari webhook Midtrans nanti punya penerima
        console.log('[payments/step3] result → NEEDS_PAYMENT');
        res.json({ ok: true, mode: 'needs_payment' });
    }
    catch (e) {
        next(e);
    }
});
/* ================= CHECKOUT (Midtrans Snap) ================= */
r.post('/checkout', requireAuth, async (req, res) => {
    var _a, _b, _c, _d;
    try {
        const { planId, employerId, customer, enabledPayments } = ((_a = req.body) !== null && _a !== void 0 ? _a : {});
        if (!planId)
            return res.status(400).json({ error: 'Invalid params: planId required' });
        const plan = await prisma_1.prisma.plan.findFirst({
            where: { OR: [{ id: planId }, { slug: planId }], active: true },
            select: { id: true, slug: true, name: true, amount: true, currency: true, interval: true, trialDays: true },
        });
        if (!plan)
            return res.status(400).json({ error: 'Plan not available' });
        if (((_b = toNumberSafe(plan.amount)) !== null && _b !== void 0 ? _b : 0) === 0) {
            return res.status(400).json({ error: 'Free plan does not require checkout' });
        }
        const maybeUserId = getMaybeUserId(req);
        const tx = await (0, midtrans_1.createSnapForPlan)({
            planId: plan.id,
            userId: maybeUserId !== null && maybeUserId !== void 0 ? maybeUserId : null,
            employerId,
            customer,
            enabledPayments,
        });
        res.json({
            token: tx.token,
            redirect_url: tx.redirect_url,
            orderId: tx.order_id,
            amount: (_c = toNumberSafe(plan.amount)) !== null && _c !== void 0 ? _c : undefined,
            currency: (_d = plan === null || plan === void 0 ? void 0 : plan.currency) !== null && _d !== void 0 ? _d : 'IDR',
        });
    }
    catch (e) {
        res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'Internal server error' });
    }
});
/* ================= Webhook Midtrans ================= */
r.post('/midtrans/notify', async (req, res) => {
    var _a, _b;
    try {
        const result = await (0, midtrans_1.handleMidtransNotification)(req.body);
        // === (1) Settlement → aktifkan/extend premium ===
        if ((result === null || result === void 0 ? void 0 : result.ok) && (result === null || result === void 0 ? void 0 : result.status) === 'settlement') {
            const orderId = String(((_a = req.body) === null || _a === void 0 ? void 0 : _a.order_id) || '');
            // Ambil payment & plan untuk tahu employer + interval
            const payment = await prisma_1.prisma.payment.findUnique({
                where: { orderId },
                select: { employerId: true, planId: true },
            });
            if ((payment === null || payment === void 0 ? void 0 : payment.employerId) && (payment === null || payment === void 0 ? void 0 : payment.planId)) {
                const plan = await prisma_1.prisma.plan.findUnique({
                    where: { id: payment.planId },
                    select: { interval: true },
                });
                const interval = (plan === null || plan === void 0 ? void 0 : plan.interval) || 'month';
                console.log('[Midtrans Notify] settlement → extendPremium', { employerId: payment.employerId, interval });
                await (0, billing_1.extendPremium)({ employerId: payment.employerId, interval });
            }
        }
        // === (2) Recompute status setelah update payment/premium ===
        const orderId = String(((_b = req.body) === null || _b === void 0 ? void 0 : _b.order_id) || '');
        if (orderId) {
            const p = await prisma_1.prisma.payment.findUnique({
                where: { orderId },
                select: { employerId: true },
            });
            if (p === null || p === void 0 ? void 0 : p.employerId) {
                await (0, billing_1.recomputeBillingStatus)(p.employerId);
            }
        }
        if ((result === null || result === void 0 ? void 0 : result.ok) === false) {
            console.warn('Midtrans notify rejected:', result);
        }
    }
    catch (e) {
        console.error('Midtrans notify error:', e);
    }
    // Selalu 200 agar Midtrans tidak retry terus-menerus
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
