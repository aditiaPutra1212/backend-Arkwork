// backend/src/services/billing.ts
import { prisma } from '../lib/prisma';
import {
  addDays, addMonths, addYears, startOfDay, endOfDay, isAfter, differenceInCalendarDays,
} from 'date-fns';
import { sendEmail } from '../lib/mailer';

export type IntervalUnit = 'month' | 'year';

/* utils waktu */
export function addInterval(from: Date, unit: IntervalUnit) {
  return unit === 'year' ? addYears(from, 1) : addMonths(from, 1);
}
export function trialWindow(days: number, from = new Date()) {
  const end = addDays(from, Math.max(0, days));
  return { start: from, end };
}
export function leftDaysText(target: Date | string | null | undefined): string {
  if (!target) return '-';
  const t = typeof target === 'string' ? new Date(target) : target;
  const diff = differenceInCalendarDays(t, new Date());
  if (diff < 0) return 'berakhir';
  if (diff === 0) return 'hari ini';
  if (diff === 1) return '1 hari';
  return `${diff} hari`;
}

/* penerima email = admin employer */
function looksEmail(s?: string | null) {
  return !!s && /^\S+@\S+\.\S+$/.test(String(s).trim());
}
async function getRecipients(employerId: string): Promise<string[]> {
  const admins = await prisma.employerAdminUser.findMany({
    where: { employerId },
    select: { email: true },
  });
  const list = admins.map(a => a.email).filter(looksEmail) as string[];
  return Array.from(new Set(list.map(e => e.toLowerCase().trim())));
}

/* templates */
function htmlTrialStarted(employerName: string, end: Date) {
  return `
    <div style="font-family:Inter,Arial,sans-serif">
      <h2>Trial aktif ✅</h2>
      <p>Halo tim <b>${employerName}</b>,</p>
      <p>Paket <b>trial</b> Anda aktif sampai <b>${end.toLocaleDateString('id-ID')}</b>.</p>
      <p>Selamat mencoba fitur ArkWork! 🎉</p>
    </div>`;
}
function htmlPremiumActivated(employerName: string, until: Date) {
  return `
    <div style="font-family:Inter,Arial,sans-serif">
      <h2>Pembayaran berhasil ✅</h2>
      <p>Halo tim <b>${employerName}</b>,</p>
      <p>Langganan <b>premium</b> aktif sampai <b>${until.toLocaleDateString('id-ID')}</b>.</p>
      <p>Terima kasih telah berlangganan ArkWork 🙌</p>
    </div>`;
}

/* notifiers */
async function notifyTrialStarted(employerId: string, employerName: string, end: Date) {
  const to = await getRecipients(employerId);
  if (to.length === 0) {
    console.warn('[MAILER] No recipients for TRIAL email. employerId=', employerId);
    return;
  }
  await sendEmail(to, 'Trial ArkWork Anda aktif', htmlTrialStarted(employerName, end));
}
async function notifyPremiumActivated(employerId: string, employerName: string, until: Date) {
  const to = await getRecipients(employerId);
  if (to.length === 0) {
    console.warn('[MAILER] No recipients for PREMIUM email. employerId=', employerId);
    return;
  }
  await sendEmail(to, 'Pembayaran berhasil — Premium aktif', htmlPremiumActivated(employerName, until));
}

/* mutations */
export async function startTrial(params: { employerId: string; planId: string; trialDays: number; }) {
  const { employerId, planId, trialDays } = params;
  const now = new Date();
  const { start, end } = trialWindow(trialDays, now);

  const emp = await prisma.employer.update({
    where: { id: employerId },
    data: {
      currentPlanId: planId,
      billingStatus: 'trial',
      trialStartedAt: start,
      trialEndsAt: end,
    },
    select: { displayName: true },
  });

  console.log('[BILLING] startTrial →', { employerId, planId, trialDays, trialEndsAt: end.toISOString() });
  await notifyTrialStarted(employerId, emp.displayName, end);
  return { trialEndsAt: end };
}

export async function activatePremium(params: {
  employerId: string; planId: string; interval: IntervalUnit; baseFrom?: Date;
}) {
  const { employerId, planId, interval, baseFrom } = params;

  const empNow = await prisma.employer.findUnique({
    where: { id: employerId },
    select: { premiumUntil: true, displayName: true },
  });
  const now = new Date();
  const startBase =
    baseFrom ?? (empNow?.premiumUntil && isAfter(empNow.premiumUntil, now) ? empNow.premiumUntil : now);
  const newUntil = addInterval(startBase, interval);

  const emp = await prisma.$transaction([
    prisma.employer.update({
      where: { id: employerId },
      data: {
        currentPlanId: planId,
        billingStatus: 'active',
        premiumUntil: newUntil,
        trialStartedAt: null,
        trialEndsAt: null,
      },
      select: { displayName: true },
    }),
    prisma.subscription.create({
      data: {
        employerId,
        planId,
        status: 'active',
        currentPeriodStart: startBase,
        currentPeriodEnd: newUntil,
      },
    }),
  ]).then(([e]) => e);

  console.log('[BILLING] activatePremium →', { employerId, planId, interval, premiumUntil: newUntil.toISOString() });
  await notifyPremiumActivated(employerId, emp.displayName, newUntil);
  return { premiumUntil: newUntil };
}

export async function extendPremium(params: { employerId: string; interval: IntervalUnit; }) {
  const { employerId, interval } = params;
  const emp = await prisma.employer.findUnique({
    where: { id: employerId },
    select: { premiumUntil: true, currentPlanId: true, displayName: true },
  });
  const now = new Date();
  const base = emp?.premiumUntil && isAfter(emp.premiumUntil, now) ? emp.premiumUntil : now;
  const newUntil = addInterval(base, interval);

  await prisma.employer.update({
    where: { id: employerId },
    data: {
      billingStatus: 'active',
      premiumUntil: newUntil,
      trialStartedAt: null,
      trialEndsAt: null,
    },
  });
  await prisma.subscription.create({
    data: {
      employerId,
      planId: emp?.currentPlanId ?? undefined!,
      status: 'active',
      currentPeriodStart: base,
      currentPeriodEnd: newUntil,
    },
  });

  console.log('[BILLING] extendPremium →', { employerId, interval, premiumUntil: newUntil.toISOString() });
  await notifyPremiumActivated(employerId, emp?.displayName || 'Perusahaan', newUntil);
  return { premiumUntil: newUntil };
}

/* recompute + reminder */
export async function recomputeBillingStatus(employerId: string) {
  const emp = await prisma.employer.findUnique({
    where: { id: employerId },
    select: { billingStatus: true, trialEndsAt: true, premiumUntil: true },
  });
  if (!emp) return null;

  const now = new Date();
  let nextStatus: 'active' | 'trial' | 'past_due' | 'none' = 'none';

  if (emp.premiumUntil && isAfter(emp.premiumUntil, now)) nextStatus = 'active';
  else if (emp.trialEndsAt && isAfter(emp.trialEndsAt, now)) nextStatus = 'trial';
  else if (emp.premiumUntil) nextStatus = 'past_due';
  else nextStatus = 'none';

  if (nextStatus !== emp.billingStatus) {
    await prisma.employer.update({ where: { id: employerId }, data: { billingStatus: nextStatus } });
  }
  return nextStatus;
}

export async function findEmployersToWarn(daysAheadArray: number[] = [7, 3, 1]) {
  const now = new Date();
  const maxDay = Math.max(...daysAheadArray, 1);
  const windowStart = startOfDay(now);
  const windowEnd = endOfDay(addDays(now, maxDay));

  const emps = await prisma.employer.findMany({
    where: {
      OR: [
        { trialEndsAt: { gte: windowStart, lte: windowEnd } },
        { premiumUntil: { gte: windowStart, lte: windowEnd } },
      ],
    },
    select: {
      id: true, slug: true, displayName: true, billingStatus: true, trialEndsAt: true, premiumUntil: true,
    },
  });
  if (emps.length === 0) return [];

  const adminRows = await prisma.employerAdminUser.findMany({
    where: { employerId: { in: emps.map(e => e.id) } },
    select: { employerId: true, email: true },
  });
  const adminMap = new Map<string, string[]>();
  for (const r of adminRows) {
    if (!looksEmail(r.email)) continue;
    const arr = adminMap.get(r.employerId) ?? [];
    arr.push(r.email!);
    adminMap.set(r.employerId, arr);
  }

  const results: Array<{
    employer: { id: string; slug: string; displayName: string; billingStatus: string; trialEndsAt: Date | null; premiumUntil: Date | null; };
    type: 'trial' | 'premium';
    warnForDate: Date;
    adminEmails: string[];
  }> = [];

  for (const emp of emps) {
    const emails = Array.from(new Set((adminMap.get(emp.id) ?? []).map(e => e.toLowerCase().trim())));

    if (emp.trialEndsAt) {
      const diff = differenceInCalendarDays(startOfDay(emp.trialEndsAt), startOfDay(now));
      if (daysAheadArray.includes(diff)) {
        results.push({ employer: emp, type: 'trial', warnForDate: emp.trialEndsAt, adminEmails: emails });
      }
    }
    if (emp.premiumUntil) {
      const diff = differenceInCalendarDays(startOfDay(emp.premiumUntil), startOfDay(now));
      if (daysAheadArray.includes(diff)) {
        results.push({ employer: emp, type: 'premium', warnForDate: emp.premiumUntil, adminEmails: emails });
      }
    }
  }
  return results;
}

export default {
  addInterval,
  trialWindow,
  leftDaysText,
  startTrial,
  activatePremium,
  extendPremium,
  recomputeBillingStatus,
  findEmployersToWarn,
};
