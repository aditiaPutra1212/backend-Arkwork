"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
// backend/src/routes/tenders.ts
const express_1 = require("express");
const client_1 = require("@prisma/client");
const prisma_1 = require("../lib/prisma");
const router = (0, express_1.Router)();
/**
 * GET /api/tenders
 * Query params:
 *  - q: string (search in title/buyer)
 *  - loc: string (location contains)
 *  - sector: 'OIL_GAS' | 'RENEWABLE_ENERGY' | 'UTILITIES' | 'ENGINEERING'
 *  - status: 'OPEN' | 'PREQUALIFICATION' | 'CLOSED'
 *  - contract: 'EPC' | 'SUPPLY' | 'CONSULTING' | 'MAINTENANCE'
 *  - sort: 'nearest' | 'farthest' (by deadline)
 *  - page: number (1-based)
 *  - perPage: number
 *  - take / skip (opsional, override page/perPage)
 */
router.get('/', async (req, res, next) => {
    try {
        const q = req.query.q?.trim();
        const loc = req.query.loc?.trim();
        const sectorStr = req.query.sector?.toUpperCase();
        const statusStr = req.query.status?.toUpperCase();
        const contractStr = req.query.contract?.toUpperCase();
        const sortParam = (req.query.sort || 'nearest').toLowerCase();
        const order = (sortParam === 'farthest' ? 'desc' : 'asc');
        const orderBy = { deadline: order };
        // pagination
        const page = Math.max(1, Number(req.query.page ?? 1));
        const perPage = Math.min(100, Math.max(1, Number(req.query.perPage ?? 20)));
        // allow take/skip to override page/perPage
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
        if (loc) {
            where.location = { contains: loc, mode: client_1.Prisma.QueryMode.insensitive };
        }
        // map string -> enum Prisma secara aman (hanya set kalau valid)
        if (sectorStr && client_1.Prisma.Sector?.[sectorStr]) {
            where.sector = client_1.Prisma.Sector[sectorStr];
        }
        if (statusStr && client_1.Prisma.Status?.[statusStr]) {
            where.status = client_1.Prisma.Status[statusStr];
        }
        if (contractStr && client_1.Prisma.Contract?.[contractStr]) {
            where.contract = client_1.Prisma.Contract[contractStr];
        }
        const [items, total] = await Promise.all([
            prisma_1.prisma.tender.findMany({
                where,
                orderBy,
                take,
                skip,
            }),
            prisma_1.prisma.tender.count({ where }),
        ]);
        res.json({
            ok: true,
            items,
            total,
            page,
            perPage: take, // jika pakai take/skip manual, nilainya merefleksikan take final
        });
    }
    catch (e) {
        next(e);
    }
});
/**
 * GET /api/tenders/:id
 * Detail tender by id (number)
 */
router.get('/:id', async (req, res, next) => {
    try {
        const idNum = Number(req.params.id);
        if (!Number.isFinite(idNum)) {
            return res.status(400).json({ error: 'Invalid id' });
        }
        const item = await prisma_1.prisma.tender.findUnique({ where: { id: idNum } });
        if (!item)
            return res.status(404).json({ error: 'Not found' });
        res.json({ ok: true, item });
    }
    catch (e) {
        next(e);
    }
});
exports.default = router;
