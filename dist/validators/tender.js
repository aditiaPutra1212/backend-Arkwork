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
    try {
        const q = req.query.q?.trim();
        const loc = req.query.loc?.trim();
        const sectorStr = req.query.sector?.trim()?.toUpperCase();
        const statusStr = req.query.status?.trim()?.toUpperCase();
        const contractStr = req.query.contract?.trim()?.toUpperCase();
        // map sort: nearest => asc (paling dekat), farthest => desc
        const sortParam = req.query.sort || 'nearest';
        const order = sortParam === 'farthest' ? 'desc' : 'asc';
        const take = Number(req.query.take ?? 20);
        const skip = Number(req.query.skip ?? 0);
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
