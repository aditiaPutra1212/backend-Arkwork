"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.addInterval = addInterval;
exports.trialWindow = trialWindow;
exports.leftDaysText = leftDaysText;
exports.startTrial = startTrial;
exports.activatePremium = activatePremium;
exports.extendPremium = extendPremium;
exports.recomputeBillingStatus = recomputeBillingStatus;
exports.findEmployersToWarn = findEmployersToWarn;
// backend/src/services/billing.ts
const prisma_1 = require("../lib/prisma");
const date_fns_1 = require("date-fns");
const mailer_1 = require("../lib/mailer");
/* utils waktu */
function addInterval(from, unit) {
    return unit === 'year' ? (0, date_fns_1.addYears)(from, 1) : (0, date_fns_1.addMonths)(from, 1);
}
function trialWindow(days, from = new Date()) {
    const end = (0, date_fns_1.addDays)(from, Math.max(0, days));
    return { start: from, end };
}
function leftDaysText(target) {
    if (!target)
        return '-';
    const t = typeof target === 'string' ? new Date(target) : target;
    const diff = (0, date_fns_1.differenceInCalendarDays)(t, new Date());
    if (diff < 0)
        return 'berakhir';
    if (diff === 0)
        return 'hari ini';
    if (diff === 1)
        return '1 hari';
    return `${diff} hari`;
}
/* penerima email = admin employer */
function looksEmail(s) {
    return !!s && /^\S+@\S+\.\S+$/.test(String(s).trim());
}
async function getRecipients(employerId) {
    const admins = await prisma_1.prisma.employerAdminUser.findMany({
        where: { employerId },
        select: { email: true },
    });
    const list = admins.map(a => a.email).filter(looksEmail);
    return Array.from(new Set(list.map(e => e.toLowerCase().trim())));
}
/* templates */
function htmlTrialStarted(employerName, end) {
    return `
    <div style="font-family:Inter,Arial,sans-serif">
      <h2>Trial aktif ✅</h2>
      <p>Halo tim <b>${employerName}</b>,</p>
      <p>Paket <b>trial</b> Anda aktif sampai <b>${end.toLocaleDateString('id-ID')}</b>.</p>
      <p>Selamat mencoba fitur ArkWork! 🎉</p>
    </div>`;
}
function htmlPremiumActivated(employerName, until) {
    return `
    <div style="font-family:Inter,Arial,sans-serif">
      <h2>Pembayaran berhasil ✅</h2>
      <p>Halo tim <b>${employerName}</b>,</p>
      <p>Langganan <b>premium</b> aktif sampai <b>${until.toLocaleDateString('id-ID')}</b>.</p>
      <p>Terima kasih telah berlangganan ArkWork 🙌</p>
    </div>`;
}
/* notifiers */
async function notifyTrialStarted(employerId, employerName, end) {
    const to = await getRecipients(employerId);
    if (to.length === 0) {
        console.warn('[MAILER] No recipients for TRIAL email. employerId=', employerId);
        return;
    }
    await (0, mailer_1.sendEmail)(to, 'Trial ArkWork Anda aktif', htmlTrialStarted(employerName, end));
}
async function notifyPremiumActivated(employerId, employerName, until) {
    const to = await getRecipients(employerId);
    if (to.length === 0) {
        console.warn('[MAILER] No recipients for PREMIUM email. employerId=', employerId);
        return;
    }
    await (0, mailer_1.sendEmail)(to, 'Pembayaran berhasil — Premium aktif', htmlPremiumActivated(employerName, until));
}
/* mutations */
async function startTrial(params) {
    const { employerId, planId, trialDays } = params;
    const now = new Date();
    const { start, end } = trialWindow(trialDays, now);
    const emp = await prisma_1.prisma.employer.update({
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
async function activatePremium(params) {
    const { employerId, planId, interval, baseFrom } = params;
    const empNow = await prisma_1.prisma.employer.findUnique({
        where: { id: employerId },
        select: { premiumUntil: true, displayName: true },
    });
    const now = new Date();
    const startBase = baseFrom !== null && baseFrom !== void 0 ? baseFrom : ((empNow === null || empNow === void 0 ? void 0 : empNow.premiumUntil) && (0, date_fns_1.isAfter)(empNow.premiumUntil, now) ? empNow.premiumUntil : now);
    const newUntil = addInterval(startBase, interval);
    const emp = await prisma_1.prisma.$transaction([
        prisma_1.prisma.employer.update({
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
        prisma_1.prisma.subscription.create({
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
async function extendPremium(params) {
    var _a;
    const { employerId, interval } = params;
    const emp = await prisma_1.prisma.employer.findUnique({
        where: { id: employerId },
        select: { premiumUntil: true, currentPlanId: true, displayName: true },
    });
    const now = new Date();
    const base = (emp === null || emp === void 0 ? void 0 : emp.premiumUntil) && (0, date_fns_1.isAfter)(emp.premiumUntil, now) ? emp.premiumUntil : now;
    const newUntil = addInterval(base, interval);
    await prisma_1.prisma.employer.update({
        where: { id: employerId },
        data: {
            billingStatus: 'active',
            premiumUntil: newUntil,
            trialStartedAt: null,
            trialEndsAt: null,
        },
    });
    await prisma_1.prisma.subscription.create({
        data: {
            employerId,
            planId: (_a = emp === null || emp === void 0 ? void 0 : emp.currentPlanId) !== null && _a !== void 0 ? _a : undefined,
            status: 'active',
            currentPeriodStart: base,
            currentPeriodEnd: newUntil,
        },
    });
    console.log('[BILLING] extendPremium →', { employerId, interval, premiumUntil: newUntil.toISOString() });
    await notifyPremiumActivated(employerId, (emp === null || emp === void 0 ? void 0 : emp.displayName) || 'Perusahaan', newUntil);
    return { premiumUntil: newUntil };
}
/* recompute + reminder */
async function recomputeBillingStatus(employerId) {
    const emp = await prisma_1.prisma.employer.findUnique({
        where: { id: employerId },
        select: { billingStatus: true, trialEndsAt: true, premiumUntil: true },
    });
    if (!emp)
        return null;
    const now = new Date();
    let nextStatus = 'none';
    if (emp.premiumUntil && (0, date_fns_1.isAfter)(emp.premiumUntil, now))
        nextStatus = 'active';
    else if (emp.trialEndsAt && (0, date_fns_1.isAfter)(emp.trialEndsAt, now))
        nextStatus = 'trial';
    else if (emp.premiumUntil)
        nextStatus = 'past_due';
    else
        nextStatus = 'none';
    if (nextStatus !== emp.billingStatus) {
        await prisma_1.prisma.employer.update({ where: { id: employerId }, data: { billingStatus: nextStatus } });
    }
    return nextStatus;
}
async function findEmployersToWarn(daysAheadArray = [7, 3, 1]) {
    var _a, _b;
    const now = new Date();
    const maxDay = Math.max(...daysAheadArray, 1);
    const windowStart = (0, date_fns_1.startOfDay)(now);
    const windowEnd = (0, date_fns_1.endOfDay)((0, date_fns_1.addDays)(now, maxDay));
    const emps = await prisma_1.prisma.employer.findMany({
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
    if (emps.length === 0)
        return [];
    const adminRows = await prisma_1.prisma.employerAdminUser.findMany({
        where: { employerId: { in: emps.map(e => e.id) } },
        select: { employerId: true, email: true },
    });
    const adminMap = new Map();
    for (const r of adminRows) {
        if (!looksEmail(r.email))
            continue;
        const arr = (_a = adminMap.get(r.employerId)) !== null && _a !== void 0 ? _a : [];
        arr.push(r.email);
        adminMap.set(r.employerId, arr);
    }
    const results = [];
    for (const emp of emps) {
        const emails = Array.from(new Set(((_b = adminMap.get(emp.id)) !== null && _b !== void 0 ? _b : []).map(e => e.toLowerCase().trim())));
        if (emp.trialEndsAt) {
            const diff = (0, date_fns_1.differenceInCalendarDays)((0, date_fns_1.startOfDay)(emp.trialEndsAt), (0, date_fns_1.startOfDay)(now));
            if (daysAheadArray.includes(diff)) {
                results.push({ employer: emp, type: 'trial', warnForDate: emp.trialEndsAt, adminEmails: emails });
            }
        }
        if (emp.premiumUntil) {
            const diff = (0, date_fns_1.differenceInCalendarDays)((0, date_fns_1.startOfDay)(emp.premiumUntil), (0, date_fns_1.startOfDay)(now));
            if (daysAheadArray.includes(diff)) {
                results.push({ employer: emp, type: 'premium', warnForDate: emp.premiumUntil, adminEmails: emails });
            }
        }
    }
    return results;
}
exports.default = {
    addInterval,
    trialWindow,
    leftDaysText,
    startTrial,
    activatePremium,
    extendPremium,
    recomputeBillingStatus,
    findEmployersToWarn,
};
