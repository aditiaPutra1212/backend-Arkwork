"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const billing_1 = require("../services/billing");
const r = (0, express_1.Router)();
/**
 * GET /api/employers/:id/billing-status
 * → Lihat status langganan: trial, active, expired
 */
r.get('/:id/billing-status', async (req, res) => {
    const employerId = req.params.id;
    const emp = await prisma_1.prisma.employer.findUnique({
        where: { id: employerId },
        select: {
            id: true,
            displayName: true,
            billingStatus: true,
            trialEndsAt: true,
            premiumUntil: true,
        },
    });
    if (!emp)
        return res.status(404).json({ error: 'Employer not found' });
    const now = new Date();
    const isTrialActive = emp.trialEndsAt && new Date(emp.trialEndsAt) > now && emp.billingStatus === 'trial';
    const isPremiumActive = emp.premiumUntil && new Date(emp.premiumUntil) > now && emp.billingStatus === 'active';
    const left = emp.billingStatus === 'trial'
        ? (0, billing_1.leftDaysText)(emp.trialEndsAt)
        : (0, billing_1.leftDaysText)(emp.premiumUntil);
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
exports.default = r;
