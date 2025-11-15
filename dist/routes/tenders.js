"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tenders.ts
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
function sanitizeTender(t) {
    if (!t)
        return t;
    return {
        ...t,
        budgetUSD: t.budgetUSD !== undefined && t.budgetUSD !== null
            ? (typeof t.budgetUSD === 'bigint' ? t.budgetUSD.toString() : String(t.budgetUSD))
            : null,
        deadline: t.deadline ? (t.deadline instanceof Date ? t.deadline.toISOString() : String(t.deadline)) : null,
        createdAt: t.createdAt ? (t.createdAt instanceof Date ? t.createdAt.toISOString() : String(t.createdAt)) : null,
    };
}
router.get('/', async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const q = (_a = req.query.q) === null || _a === void 0 ? void 0 : _a.trim();
        const loc = (_b = req.query.loc) === null || _b === void 0 ? void 0 : _b.trim();
        const sectorStr = (_c = req.query.sector) === null || _c === void 0 ? void 0 : _c.toUpperCase();
        const statusStr = (_d = req.query.status) === null || _d === void 0 ? void 0 : _d.toUpperCase();
        const contractStr = (_e = req.query.contract) === null || _e === void 0 ? void 0 : _e.toUpperCase();
        const sortParam = (req.query.sort || 'nearest').toLowerCase();
        const order = (sortParam === 'farthest' ? 'desc' : 'asc');
        const orderBy = { deadline: order };
        const page = Math.max(1, Number((_f = req.query.page) !== null && _f !== void 0 ? _f : 1));
        const perPage = Math.min(100, Math.max(1, Number((_g = req.query.perPage) !== null && _g !== void 0 ? _g : 20)));
        const takeOverride = req.query.take !== undefined ? Number(req.query.take) : undefined;
        const skipOverride = req.query.skip !== undefined ? Number(req.query.skip) : undefined;
        const take = Number.isFinite(takeOverride) ? Number(takeOverride) : perPage;
        const skip = Number.isFinite(skipOverride) ? Number(skipOverride) : (page - 1) * perPage;
        const where = {};
        if (q) {
            where.OR = [
                { title: { contains: q, mode: client_1.Prisma.QueryMode.insensitive } },
                { buyer: { contains: q, mode: client_1.Prisma.QueryMode.insensitive } },
            ];
        }
        if (loc)
            where.location = { contains: loc, mode: client_1.Prisma.QueryMode.insensitive };
        if (sectorStr && ((_h = client_1.Prisma.Sector) === null || _h === void 0 ? void 0 : _h[sectorStr]))
            where.sector = client_1.Prisma.Sector[sectorStr];
        if (statusStr && ((_j = client_1.Prisma.Status) === null || _j === void 0 ? void 0 : _j[statusStr]))
            where.status = client_1.Prisma.Status[statusStr];
        if (contractStr && ((_k = client_1.Prisma.Contract) === null || _k === void 0 ? void 0 : _k[contractStr]))
            where.contract = client_1.Prisma.Contract[contractStr];
        const [items, total] = await Promise.all([
            prisma_1.prisma.tender.findMany({ where, orderBy, take, skip }),
            prisma_1.prisma.tender.count({ where }),
        ]);
        const safeItems = items.map(sanitizeTender);
        res.json({ ok: true, items: safeItems, total, page, perPage: take });
    }
    catch (e) {
        next(e);
    }
});
router.get('/:id', async (req, res, next) => {
    try {
        const idNum = Number(req.params.id);
        if (!Number.isFinite(idNum))
            return res.status(400).json({ error: 'Invalid id' });
        const item = await prisma_1.prisma.tender.findUnique({ where: { id: idNum } });
        if (!item)
            return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, item: sanitizeTender(item) });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
