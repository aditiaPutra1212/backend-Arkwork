"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// src/routes/tenders.ts
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const client_1 = require("@prisma/client");
const router = (0, express_1.Router)();
/**
 * GET /api/tenders
 * Query:
 *   q          : string (search in title/buyer)
 *   loc        : string (location contains)
 *   sector     : OIL_GAS | RENEWABLE_ENERGY | UTILITIES | ENGINEERING
 *   status     : OPEN | PREQUALIFICATION | CLOSED
 *   contract   : EPC | SUPPLY | CONSULTING | MAINTENANCE
 *   sort       : 'nearest' | 'farthest'  (by deadline)
 *   take       : number (default 20)
 *   skip       : number (default 0)
 */
router.get('/api/tenders', async (req, res, next) => {
    var _a, _b, _c, _d, _e, _f, _g, _h, _j, _k;
    try {
        const q = (_a = req.query.q) === null || _a === void 0 ? void 0 : _a.trim();
        const loc = (_b = req.query.loc) === null || _b === void 0 ? void 0 : _b.trim();
        const sectorStr = (_d = (_c = req.query.sector) === null || _c === void 0 ? void 0 : _c.trim()) === null || _d === void 0 ? void 0 : _d.toUpperCase();
        const statusStr = (_f = (_e = req.query.status) === null || _e === void 0 ? void 0 : _e.trim()) === null || _f === void 0 ? void 0 : _f.toUpperCase();
        const contractStr = (_h = (_g = req.query.contract) === null || _g === void 0 ? void 0 : _g.trim()) === null || _h === void 0 ? void 0 : _h.toUpperCase();
        // map sort: nearest => asc (paling dekat), farthest => desc
        const sortParam = req.query.sort || 'nearest';
        const order = sortParam === 'farthest' ? 'desc' : 'asc';
        const take = Number((_j = req.query.take) !== null && _j !== void 0 ? _j : 20);
        const skip = Number((_k = req.query.skip) !== null && _k !== void 0 ? _k : 0);
        // Build where
        const where = {};
        if (q) {
            where.OR = [
                { title: { contains: q, mode: client_1.Prisma.QueryMode.insensitive } },
                { buyer: { contains: q, mode: client_1.Prisma.QueryMode.insensitive } },
            ];
        }
        if (loc) {
            where.location = { contains: loc, mode: client_1.Prisma.QueryMode.insensitive };
        }
        if (sectorStr && client_1.Sector[sectorStr]) {
            where.sector = client_1.Sector[sectorStr];
        }
        if (statusStr && client_1.Status[statusStr]) {
            where.status = client_1.Status[statusStr];
        }
        if (contractStr && client_1.Contract[contractStr]) {
            where.contract = client_1.Contract[contractStr];
        }
        const [items, total] = await Promise.all([
            prisma_1.prisma.tender.findMany({
                where,
                orderBy: { deadline: order }, // <<<<< penting: order bertipe Prisma.SortOrder
                take,
                skip,
            }),
            prisma_1.prisma.tender.count({ where }),
        ]);
        res.json({ ok: true, items, total });
    }
    catch (e) {
        next(e);
    }
});
/** GET /api/tenders/:id */
router.get('/api/tenders/:id', async (req, res, next) => {
    try {
        const id = Number(req.params.id);
        if (!Number.isFinite(id))
            return res.status(400).json({ error: 'invalid id' });
        const tender = await prisma_1.prisma.tender.findUnique({ where: { id } });
        if (!tender)
            return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, tender });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
