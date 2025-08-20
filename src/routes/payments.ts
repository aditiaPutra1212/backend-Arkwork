// src/routes/payments.ts
import { Router, Request, Response, NextFunction } from 'express'
import { prisma } from '../lib/prisma'

// ===== Auth placeholder (sesuaikan dengan sistemmu) =====
function requireAuth(_req: any, _res: Response, next: NextFunction) {
  return next()
}
function getMaybeEmployerId(req: Request): string | undefined {
  const anyReq = req as any
  return anyReq?.user?.employerId ?? anyReq?.session?.employerId ?? req.body?.employerId
}

const r = Router()

/* ================= LIST SUBSCRIPTIONS (sebagai pengganti payments) ================= */
r.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const take = Math.min(Math.max(Number(req.query.take ?? 20), 1), 100)
    const cursor = (req.query.cursor as string | undefined) ?? undefined
    const items = await prisma.subscription.findMany({
      take,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        status: true,
        createdAt: true,
        updatedAt: true,
        employer: { select: { id: true, slug: true, displayName: true, legalName: true } },
        plan: { select: { id: true, slug: true, name: true, amount: true, currency: true, interval: true } },
      },
    })
    const nextCursor = items.length === take ? items[items.length - 1].id : null
    res.json({ items, nextCursor })
  } catch (e) {
    next(e)
  }
})

/* ================= PUBLIC PLANS (signup step) ================= */
r.get('/plans', async (_req: Request, res: Response, next: NextFunction) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ amount: 'asc' }, { id: 'asc' }],
      select: {
        id: true,
        slug: true,
        name: true,
        description: true,
        amount: true, // Int di schema
        currency: true,
        interval: true,
        active: true,
      },
    })
    res.json(plans)
  } catch (e) {
    next(e)
  }
})

/* ================= CHECKOUT SEDERHANA: bikin subscription langsung ================= */
r.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { planId, employerId: employerIdBody } = (req.body ?? {}) as any
    const employerId = employerIdBody ?? getMaybeEmployerId(req)
    if (!planId || !employerId) return res.status(400).json({ error: 'planId dan employerId diperlukan' })

    const plan = await prisma.plan.findFirst({
      where: { OR: [{ id: planId }, { slug: planId }] },
      select: { id: true, amount: true, currency: true },
    })
    if (!plan) return res.status(404).json({ error: 'Plan not found' })

    const sub = await prisma.subscription.create({
      data: {
        employerId: String(employerId),
        planId: plan.id,
        status: 'active', // schema string
      },
      select: { id: true, employerId: true, planId: true, status: true, createdAt: true },
    })

    // response mirip transaksi (tanpa Midtrans)
    res.json({
      ok: true,
      subscriptionId: sub.id,
      employerId: sub.employerId,
      planId: sub.planId,
      status: sub.status,
      amount: plan.amount,
      currency: plan.currency ?? 'IDR',
    })
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Internal server error' })
  }
})

/* ================= Webhook Midtrans (placeholder) ================= */
r.post('/midtrans/notify', async (_req: Request, res: Response) => {
  // tidak ada tabel Payment → noop
  res.status(200).json({ ok: true })
})

export default r
