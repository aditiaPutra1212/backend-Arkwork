import { Router, Request, Response } from 'express';
import { PrismaClient, Prisma } from '@prisma/client';
import { adminRequired } from '../middleware/role';

const prisma = new PrismaClient();
const router = Router();

/* -----------------------------------------------------------
 * Utils
 * ---------------------------------------------------------*/
function toInt(v: unknown, def = 0): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : def;
}

function toDocs(v: unknown): string[] {
  if (Array.isArray(v)) return v.map(String).map(s => s.trim()).filter(Boolean);
  if (typeof v === 'string') {
    return v
      .split(',')
      .map(s => s.trim())
      .filter(Boolean);
  }
  return [];
}

/* -----------------------------------------------------------
 * Create tender (ADMIN ONLY)
 * POST /admin/tenders
 * body: { title, buyer, sector, location, status, contract, budgetUSD, teamSlots, description, documents, deadline }
 * ---------------------------------------------------------*/
router.post('/', adminRequired, async (req: Request, res: Response) => {
  try {
    const {
      title,
      buyer,
      sector,     // enum Sector
      location,
      status,     // enum Status
      contract,   // enum Contract
      budgetUSD,
      teamSlots,
      description,
      documents,
      deadline,
    } = req.body ?? {};

    if (!title || !buyer || !sector || !status || !contract) {
      return res.status(400).json({ message: 'Missing required fields' });
    }

    const created = await prisma.tender.create({
      data: {
        title: String(title),
        buyer: String(buyer),
        sector,                // Prisma akan validasi enum
        location: String(location ?? ''),
        status,                // enum
        contract,              // enum
        budgetUSD: toInt(budgetUSD, 0),
        teamSlots: toInt(teamSlots, 0),
        description: String(description ?? ''),
        documents: toDocs(documents),
        deadline: deadline ? new Date(deadline) : new Date(), // boleh pilih default
      },
    });

    return res.json(created);
  } catch (err: any) {
    console.error('Create tender error:', err);
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * List + filter (ADMIN ONLY)
 * GET /admin/tenders?q=&sector=&status=&contract=&loc=&sort=asc|desc
 * ---------------------------------------------------------*/
router.get('/', adminRequired, async (req: Request, res: Response) => {
  try {
    const { q, sector, status, contract, loc, sort } = req.query as Record<string, string | undefined>;

    const where: Prisma.TenderWhereInput = {
      AND: [
        q
          ? {
              OR: [
                { title: { contains: q, mode: Prisma.QueryMode.insensitive } },
                { buyer: { contains: q, mode: Prisma.QueryMode.insensitive } },
              ],
            }
          : undefined,
        loc
          ? { location: { contains: loc, mode: Prisma.QueryMode.insensitive } }
          : undefined,
        sector ? { sector: sector as any } : undefined,
        status ? { status: status as any } : undefined,
        contract ? { contract: contract as any } : undefined,
      ].filter(Boolean) as Prisma.TenderWhereInput[],
    };

    const orderBy: Prisma.TenderOrderByWithRelationInput = {
      deadline: (sort === 'desc' ? 'desc' : 'asc') as Prisma.SortOrder,
    };

    const list = await prisma.tender.findMany({
      where,
      orderBy,
    });

    return res.json(list);
  } catch (err: any) {
    console.error('List tenders error:', err);
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * Get detail (ADMIN ONLY)
 * GET /admin/tenders/:id
 * ---------------------------------------------------------*/
router.get('/:id', adminRequired, async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const item = await prisma.tender.findUnique({ where: { id } });
    if (!item) return res.status(404).json({ message: 'Not found' });
    return res.json(item);
  } catch (err: any) {
    console.error('Get tender error:', err);
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * Update (ADMIN ONLY)
 * PATCH /admin/tenders/:id
 * ---------------------------------------------------------*/
router.patch('/:id', adminRequired, async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    const {
      title,
      buyer,
      sector,
      location,
      status,
      contract,
      budgetUSD,
      teamSlots,
      description,
      documents,
      deadline,
    } = req.body ?? {};

    const updated = await prisma.tender.update({
      where: { id },
      data: {
        ...(title !== undefined ? { title: String(title) } : {}),
        ...(buyer !== undefined ? { buyer: String(buyer) } : {}),
        ...(sector !== undefined ? { sector } : {}),
        ...(location !== undefined ? { location: String(location) } : {}),
        ...(status !== undefined ? { status } : {}),
        ...(contract !== undefined ? { contract } : {}),
        ...(budgetUSD !== undefined ? { budgetUSD: toInt(budgetUSD, 0) } : {}),
        ...(teamSlots !== undefined ? { teamSlots: toInt(teamSlots, 0) } : {}),
        ...(description !== undefined ? { description: String(description) } : {}),
        ...(documents !== undefined ? { documents: toDocs(documents) } : {}),
        ...(deadline !== undefined ? { deadline: new Date(deadline) } : {}),
      },
    });

    return res.json(updated);
  } catch (err: any) {
    console.error('Update tender error:', err);
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

/* -----------------------------------------------------------
 * Delete (ADMIN ONLY)
 * DELETE /admin/tenders/:id
 * ---------------------------------------------------------*/
router.delete('/:id', adminRequired, async (req: Request, res: Response) => {
  try {
    const id = toInt(req.params.id, NaN);
    if (!Number.isFinite(id)) return res.status(400).json({ message: 'Invalid id' });

    await prisma.tender.delete({ where: { id } });
    return res.status(204).end();
  } catch (err: any) {
    console.error('Delete tender error:', err);
    if (err?.code === 'P2025') return res.status(404).json({ message: 'Not found' });
    return res.status(500).json({ message: err?.message ?? 'Internal error' });
  }
});

export default router;
