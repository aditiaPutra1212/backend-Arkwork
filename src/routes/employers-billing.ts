import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { leftDaysText } from '../services/billing';

const r = Router();

/**
 * GET /api/employers/:id/billing-status
 * → Lihat status langganan: trial, active, expired
 */
r.get('/:id/billing-status', async (req, res) => {
  const employerId = req.params.id;
  const emp = await prisma.employer.findUnique({
    where: { id: employerId },
    select: {
      id: true,
      displayName: true,
      billingStatus: true,
      trialEndsAt: true,
      premiumUntil: true,
    },
  });
  if (!emp) return res.status(404).json({ error: 'Employer not found' });

  const now = new Date();
  const isTrialActive =
    emp.trialEndsAt && new Date(emp.trialEndsAt) > now && emp.billingStatus === 'trial';
  const isPremiumActive =
    emp.premiumUntil && new Date(emp.premiumUntil) > now && emp.billingStatus === 'active';
  const left =
    emp.billingStatus === 'trial'
      ? leftDaysText(emp.trialEndsAt)
      : leftDaysText(emp.premiumUntil);

  res.json({
    id: emp.id,
    name: emp.displayName,
    billingStatus: emp.billingStatus,
    trialEndsAt: emp.trialEndsAt,
    premiumUntil: emp.premiumUntil,
    active: isTrialActive || isPremiumActive,
    timeLeft: left,
  });
});

export default r;
