// backend/src/routes/payments.ts
import { Router, Request, Response, NextFunction } from 'express';
import { prisma } from '../lib/prisma';
import { createSnapForPlan, handleMidtransNotification } from '../services/midtrans';
import {
  startTrial,                 // startTrial({ employerId, planId, trialDays })
  activatePremium,            // activatePremium({ employerId, planId, interval, baseFrom? })
  extendPremium,              // ⬅️ dipakai untuk settlement webhook
  recomputeBillingStatus,     // recomputeBillingStatus(employerId)
} from '../services/billing';

/* ================= Auth placeholder ================= */
function requireAuth(_req: any, _res: Response, next: NextFunction) {
  return next();
}
function getMaybeUserId(req: Request): string | undefined {
  const anyReq = req as any;
  return anyReq?.user?.id ?? anyReq?.session?.user?.id ?? (req.body as any)?.userId;
}

const r = Router();

/* ================= Utils ================= */
function toNumberSafe(v: any): number | null {
  if (v == null) return null;
  if (typeof v === 'number') return v;
  if (typeof (v as any)?.toNumber === 'function') return (v as any).toNumber(); // Prisma Decimal
  if (typeof v === 'bigint') return Number(v);
  if (typeof v === 'string' && /^\d+(\.\d+)?$/.test(v)) return Number(v);
  return Number(v);
}
const looksEmail = (s?: string | null) => !!s && /^\S+@\S+\.\S+$/.test(String(s).trim());

/* ================= LIST (admin/inbox) ================= */
r.get('/', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const take = Math.min(Math.max(Number(req.query.take ?? 20), 1), 100);
    const cursor = (req.query.cursor as string | undefined) ?? undefined;
    const status = (req.query.status as string | undefined)?.trim();
    const where = status ? { status } : undefined;

    const rows = await prisma.payment.findMany({
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

    const items = rows.map((p) => ({
      id: p.id,
      orderId: p.orderId,
      status: p.status,
      method: p.method ?? null,
      grossAmount: toNumberSafe(p.grossAmount) ?? 0,
      currency: p.currency ?? 'IDR',
      createdAt: p.createdAt?.toISOString?.() ?? new Date(p.createdAt as any).toISOString(),
      transactionId: p.transactionId ?? null,
      plan: p.plan ? { id: p.plan.id, slug: p.plan.slug, name: p.plan.name, interval: p.plan.interval } : null,
      employer: p.employer
        ? { id: p.employer.id, displayName: p.employer.displayName, legalName: p.employer.legalName, slug: p.employer.slug }
        : null,
    }));

    const nextCursor = rows.length === take ? rows[rows.length - 1].id : null;
    res.json({ items, nextCursor });
  } catch (e) {
    next(e);
  }
});

/* ================= PUBLIC PLANS ================= */
r.get('/plans', async (_req, res, next) => {
  try {
    const plans = await prisma.plan.findMany({
      where: { active: true },
      orderBy: [{ amount: 'asc' }, { id: 'asc' }],
      select: {
        id: true, slug: true, name: true, description: true, amount: true, currency: true,
        interval: true, active: true, priceId: true, trialDays: true,
      },
    });

    res.json(plans.map((p) => ({ ...p, amount: toNumberSafe(p.amount) ?? 0 })));
  } catch (e) {
    next(e);
  }
});

/**
 * STEP 3 pilih paket (tangani trial/gratis)
 * Body: { employerId, planSlug, contact?: { email?: string; name?: string } }
 */
r.post('/employers/step3', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { employerId, planSlug, contact } = req.body as {
      employerId: string;
      planSlug: string;
      contact?: { email?: string; name?: string };
    };

    console.log('[payments/step3] in →', { employerId, planSlug, contact });

    if (!employerId || !planSlug) return res.status(400).json({ error: 'employerId & planSlug required' });

    const employer = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { id: true, displayName: true, slug: true },
    });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    const plan = await prisma.plan.findUnique({ where: { slug: planSlug } });
    if (!plan || !plan.active) return res.status(400).json({ error: 'Plan not available' });

    // --- Helper: pastikan ada minimal satu admin (pakai email dari form kalau belum ada)
    async function ensureAtLeastOneAdmin(): Promise<string[]> {
      const admins = await prisma.employerAdminUser.findMany({
        where: { employerId },
        select: { email: true },
      });
      let emails = admins.map((a) => a.email).filter(looksEmail) as string[];

      if (emails.length === 0 && looksEmail(contact?.email)) {
        const email = contact!.email!.trim().toLowerCase();
        await prisma.employerAdminUser.create({
          data: { employerId, email, name: contact?.name || 'Admin' } as any,
        });
        emails = [email];
        console.log('[payments/step3] created admin fallback →', email);
      }

      emails = Array.from(new Set(emails.map((e) => e.toLowerCase().trim())));
      console.log('[payments/step3] recipients →', emails);
      return emails;
    }

    // ====== TRIAL
    if ((plan.trialDays ?? 0) > 0) {
      await ensureAtLeastOneAdmin();

      const { trialEndsAt } = await startTrial({
        employerId,
        planId: plan.id,
        trialDays: plan.trialDays,
      });

      await prisma.employer.update({
        where: { id: employerId },
        data: { onboardingStep: 'VERIFY' },
      });

      console.log('[payments/step3] result → TRIAL', { trialEndsAt });
      return res.json({ ok: true, mode: 'trial', trialEndsAt: new Date(trialEndsAt).toISOString() });
    }

    // ====== GRATIS (amount == 0)
    const amount = toNumberSafe(plan.amount) ?? 0;
    if (amount <= 0) {
      await ensureAtLeastOneAdmin();

      const { premiumUntil } = await activatePremium({
        employerId,
        planId: plan.id,
        interval: (plan.interval as 'month' | 'year') || 'month',
      });

      await prisma.employer.update({
        where: { id: employerId },
        data: { onboardingStep: 'VERIFY' },
      });

      console.log('[payments/step3] result → FREE_ACTIVE', { premiumUntil });
      return res.json({ ok: true, mode: 'free_active', premiumUntil: new Date(premiumUntil).toISOString() });
    }

    // ====== BERBAYAR & tanpa trial → checkout
    await prisma.employer.update({
      where: { id: employerId },
      data: { currentPlanId: plan.id, onboardingStep: 'VERIFY' },
    });
    await ensureAtLeastOneAdmin(); // supaya email dari webhook Midtrans nanti punya penerima
    console.log('[payments/step3] result → NEEDS_PAYMENT');
    res.json({ ok: true, mode: 'needs_payment' });
  } catch (e) {
    next(e);
  }
});

/* ================= CHECKOUT (Midtrans Snap) ================= */
r.post('/checkout', requireAuth, async (req: Request, res: Response) => {
  try {
    const { planId, employerId, customer, enabledPayments } = (req.body ?? {}) as any;
    if (!planId) return res.status(400).json({ error: 'Invalid params: planId required' });

    const plan = await prisma.plan.findFirst({
      where: { OR: [{ id: planId }, { slug: planId }], active: true },
      select: { id: true, slug: true, name: true, amount: true, currency: true, interval: true, trialDays: true },
    });
    if (!plan) return res.status(400).json({ error: 'Plan not available' });

    if ((toNumberSafe(plan.amount) ?? 0) === 0) {
      return res.status(400).json({ error: 'Free plan does not require checkout' });
    }

    const maybeUserId = getMaybeUserId(req);

    const tx = await createSnapForPlan({
      planId: plan.id,
      userId: maybeUserId ?? null,
      employerId,
      customer,
      enabledPayments,
    });

    res.json({
      token: (tx as any).token,
      redirect_url: (tx as any).redirect_url,
      orderId: (tx as any).order_id,
      amount: toNumberSafe((plan as any).amount) ?? undefined,
      currency: plan?.currency ?? 'IDR',
    });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'Internal server error' });
  }
});

/* ================= Webhook Midtrans ================= */
r.post('/midtrans/notify', async (req: Request, res: Response) => {
  try {
    const result = await handleMidtransNotification(req.body);

    // === (1) Settlement → aktifkan/extend premium ===
    if ((result as any)?.ok && (result as any)?.status === 'settlement') {
      const orderId = String(req.body?.order_id || '');

      // Ambil payment & plan untuk tahu employer + interval
      const payment = await prisma.payment.findUnique({
        where: { orderId },
        select: { employerId: true, planId: true },
      });

      if (payment?.employerId && payment?.planId) {
        const plan = await prisma.plan.findUnique({
          where: { id: payment.planId },
          select: { interval: true },
        });

        const interval = (plan?.interval as 'month' | 'year') || 'month';
        console.log('[Midtrans Notify] settlement → extendPremium', { employerId: payment.employerId, interval });

        await extendPremium({ employerId: payment.employerId, interval });
      }
    }

    // === (2) Recompute status setelah update payment/premium ===
    const orderId = String(req.body?.order_id || '');
    if (orderId) {
      const p = await prisma.payment.findUnique({
        where: { orderId },
        select: { employerId: true },
      });
      if (p?.employerId) {
        await recomputeBillingStatus(p.employerId);
      }
    }

    if ((result as any)?.ok === false) {
      console.warn('Midtrans notify rejected:', result);
    }
  } catch (e) {
    console.error('Midtrans notify error:', e);
  }
  // Selalu 200 agar Midtrans tidak retry terus-menerus
  res.status(200).json({ ok: true });
});

/* ================= Detail by orderId (polling) ================= */
r.get('/:orderId', requireAuth, async (req: Request, res: Response, next: NextFunction) => {
  try {
    const p = await prisma.payment.findUnique({
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
    if (!p) return res.status(404).json({ error: 'Not found' });

    res.json({
      orderId: p.orderId,
      status: p.status,
      method: p.method ?? null,
      grossAmount: toNumberSafe(p.grossAmount) ?? 0,
      currency: p.currency ?? 'IDR',
      createdAt: p.createdAt?.toISOString?.() ?? new Date(p.createdAt as any).toISOString(),
      transactionId: p.transactionId ?? null,
    });
  } catch (e) {
    next(e);
  }
});

export default r;
