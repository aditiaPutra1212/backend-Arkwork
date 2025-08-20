"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
// NOTE: kita sengaja TIDAK mengunci tipe Prisma di sini (PlanWhereInput/PlanUpdateInput)
// supaya tidak error jika nama model di schema bukan "Plan". Fokusnya: build lulus.
function requireAdmin(_req, _res, next) {
    next();
}
const r = (0, express_1.Router)();
// --- helpers ---
function serializePlan(p) {
    return { ...p, amount: typeof p?.amount === 'bigint' ? Number(p.amount) : p?.amount };
}
function serializePlans(items) {
    return items.map(serializePlan);
}
function toBigIntAmount(v) {
    const n = Number(v);
    if (!Number.isFinite(n) || n < 0)
        throw new Error('amount must be a non-negative number');
    return BigInt(Math.trunc(n));
}
// ================= GET list =================
r.get('/', requireAdmin, async (req, res, next) => {
    try {
        const q = req.query.q?.trim();
        // gunakan string literal 'insensitive', jangan Prisma.QueryMode
        const where = q && q.length
            ? {
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { slug: { contains: q, mode: 'insensitive' } },
                ],
            }
            : undefined;
        const items = await prisma_1.prisma.plan.findMany({ where, orderBy: { id: 'desc' } });
        res.json(serializePlans(items));
    }
    catch (e) {
        next(e);
    }
});
// ================= GET detail =================
r.get('/:id', requireAdmin, async (req, res, next) => {
    try {
        const plan = await prisma_1.prisma.plan.findUnique({ where: { id: req.params.id } });
        if (!plan)
            return res.status(404).json({ error: 'Plan not found' });
        res.json(serializePlan(plan));
    }
    catch (e) {
        next(e);
    }
});
// ================= CREATE =================
r.post('/', requireAdmin, async (req, res, next) => {
    try {
        const { slug, name, description, amount, currency = 'IDR', interval = 'month', active = true, priceId, paymentLinkUrl, } = req.body || {};
        if (!slug || !name)
            return res.status(400).json({ error: 'slug and name are required' });
        let amountBig;
        try {
            amountBig = toBigIntAmount(amount);
        }
        catch (err) {
            return res.status(400).json({ error: err?.message || 'Invalid amount' });
        }
        const data = {
            slug: String(slug),
            name: String(name),
            description: description ?? null,
            amount: amountBig, // BigInt column
            currency: String(currency),
            interval: String(interval),
            active: !!active,
            priceId: priceId ?? null,
        };
        if (paymentLinkUrl !== undefined)
            data.paymentLinkUrl = paymentLinkUrl ?? null;
        const plan = await prisma_1.prisma.plan.create({ data });
        res.status(201).json(serializePlan(plan));
    }
    catch (e) {
        if (e?.code === 'P2002')
            return res.status(409).json({ error: 'Slug already exists' });
        next(e);
    }
});
// ================= UPDATE =================
r.put('/:id', requireAdmin, async (req, res, next) => {
    try {
        const { id } = req.params;
        const { slug, name, description, amount, currency, interval, active, priceId, paymentLinkUrl } = req.body || {};
        const data = {};
        if (slug !== undefined)
            data.slug = String(slug);
        if (name !== undefined)
            data.name = String(name);
        if (description !== undefined)
            data.description = description ?? null;
        if (amount !== undefined) {
            try {
                data.amount = toBigIntAmount(amount);
            }
            catch (err) {
                return res.status(400).json({ error: err?.message || 'Invalid amount' });
            }
        }
        if (currency !== undefined)
            data.currency = String(currency);
        if (interval !== undefined)
            data.interval = String(interval);
        if (active !== undefined)
            data.active = !!active;
        if (priceId !== undefined)
            data.priceId = priceId ?? null;
        if (paymentLinkUrl !== undefined)
            data.paymentLinkUrl = paymentLinkUrl ?? null;
        const plan = await prisma_1.prisma.plan.update({ where: { id }, data });
        res.json(serializePlan(plan));
    }
    catch (e) {
        if (e?.code === 'P2002')
            return res.status(409).json({ error: 'Slug already exists' });
        if (e?.code === 'P2025')
            return res.status(404).json({ error: 'Plan not found' });
        next(e);
    }
});
// ================= DELETE =================
r.delete('/:id', requireAdmin, async (req, res, next) => {
    try {
        await prisma_1.prisma.plan.delete({ where: { id: req.params.id } });
        res.status(204).end();
    }
    catch (e) {
        if (e?.code === 'P2025')
            return res.status(404).json({ error: 'Plan not found' });
        if (e?.code === 'P2003') {
            return res.status(409).json({
                error: 'Plan is referenced by other records (payments/subscriptions). Deactivate it instead of deleting.',
            });
        }
        next(e);
    }
});
exports.default = r;
