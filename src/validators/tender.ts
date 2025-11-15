// src/routes/tenders.ts
import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { Prisma, Sector, Status, Contract } from '@prisma/client';

const router = Router();

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
    const q = (req.query.q as string | undefined)?.trim();
    const loc = (req.query.loc as string | undefined)?.trim();
    const sectorStr = (req.query.sector as string | undefined)?.trim()?.toUpperCase();
    const statusStr = (req.query.status as string | undefined)?.trim()?.toUpperCase();
    const contractStr = (req.query.contract as string | undefined)?.trim()?.toUpperCase();

    // map sort: nearest => asc (paling dekat), farthest => desc
    const sortParam = (req.query.sort as string | undefined) || 'nearest';
    const order: Prisma.SortOrder = sortParam === 'farthest' ? 'desc' : 'asc';

    const take = Number(req.query.take ?? 20);
    const skip = Number(req.query.skip ?? 0);

    // Build where
    const where: Prisma.TenderWhereInput = {};

    if (q) {
      where.OR = [
        { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
        { buyer: { contains: q, mode: Prisma.QueryMode.insensitive } },
      ];
    }
    if (loc) {
      where.location = { contains: loc, mode: Prisma.QueryMode.insensitive };
    }
    if (sectorStr && Sector[sectorStr as keyof typeof Sector]) {
      where.sector = Sector[sectorStr as keyof typeof Sector];
    }
    if (statusStr && Status[statusStr as keyof typeof Status]) {
      where.status = Status[statusStr as keyof typeof Status];
    }
    if (contractStr && Contract[contractStr as keyof typeof Contract]) {
      where.contract = Contract[contractStr as keyof typeof Contract];
    }

    const [items, total] = await Promise.all([
      prisma.tender.findMany({
        where,
        orderBy: { deadline: order }, // <<<<< penting: order bertipe Prisma.SortOrder
        take,
        skip,
      }),
      prisma.tender.count({ where }),
    ]);

    res.json({ ok: true, items, total });
  } catch (e) {
    next(e);
  }
});

/** GET /api/tenders/:id */
router.get('/api/tenders/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isFinite(id)) return res.status(400).json({ error: 'invalid id' });

    const tender = await prisma.tender.findUnique({ where: { id } });
    if (!tender) return res.status(404).json({ error: 'Not found' });

    res.json({ ok: true, tender });
  } catch (e) {
    next(e);
  }
});

export default router;
