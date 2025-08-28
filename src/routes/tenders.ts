// backend/src/routes/tenders.ts
import { Router, Request, Response, NextFunction } from 'express';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma';

const router = Router();

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
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const q = (req.query.q as string | undefined)?.trim();
    const loc = (req.query.loc as string | undefined)?.trim();

    const sectorStr   = (req.query.sector   as string | undefined)?.toUpperCase();
    const statusStr   = (req.query.status   as string | undefined)?.toUpperCase();
    const contractStr = (req.query.contract as string | undefined)?.toUpperCase();

    const sortParam = ((req.query.sort as string | undefined) || 'nearest').toLowerCase();
    const order = (sortParam === 'farthest' ? 'desc' : 'asc') as Prisma.SortOrder;
    const orderBy: Prisma.TenderOrderByWithRelationInput = { deadline: order };

    // pagination
    const page = Math.max(1, Number(req.query.page ?? 1));
    const perPage = Math.min(100, Math.max(1, Number(req.query.perPage ?? 20)));
    // allow take/skip to override page/perPage
    const takeOverride = req.query.take !== undefined ? Number(req.query.take) : undefined;
    const skipOverride = req.query.skip !== undefined ? Number(req.query.skip) : undefined;
    const take = Number.isFinite(takeOverride as number) ? Number(takeOverride) : perPage;
    const skip = Number.isFinite(skipOverride as number) ? Number(skipOverride) : (page - 1) * perPage;

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

    // map string -> enum Prisma secara aman (hanya set kalau valid)
    if (sectorStr && (Prisma as any).Sector?.[sectorStr]) {
      where.sector = (Prisma as any).Sector[sectorStr];
    }
    if (statusStr && (Prisma as any).Status?.[statusStr]) {
      where.status = (Prisma as any).Status[statusStr];
    }
    if (contractStr && (Prisma as any).Contract?.[contractStr]) {
      where.contract = (Prisma as any).Contract[contractStr];
    }

    const [items, total] = await Promise.all([
      prisma.tender.findMany({
        where,
        orderBy,
        take,
        skip,
      }),
      prisma.tender.count({ where }),
    ]);

    res.json({
      ok: true,
      items,
      total,
      page,
      perPage: take, // jika pakai take/skip manual, nilainya merefleksikan take final
    });
  } catch (e) {
    next(e);
  }
});

/**
 * GET /api/tenders/:id
 * Detail tender by id (number)
 */
router.get('/:id', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const idNum = Number(req.params.id);
    if (!Number.isFinite(idNum)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const item = await prisma.tender.findUnique({ where: { id: idNum } });
    if (!item) return res.status(404).json({ error: 'Not found' });

    res.json({ ok: true, item });
  } catch (e) {
    next(e);
  }
});

export default router;
