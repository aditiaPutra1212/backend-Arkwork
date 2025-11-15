"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const prisma_1 = require("../lib/prisma");
const mailer_1 = require("../lib/mailer");
const emailTemplates_1 = require("../lib/emailTemplates");
const r = (0, express_1.Router)();
// GET /dev/mail/try?employerId=...&type=trial|paid|warn3|warn1|expired
r.get('/dev/mail/try', async (req, res) => {
    try {
        const { employerId, type = 'trial' } = req.query;
        if (!employerId)
            return res.status(400).json({ error: 'employerId required' });
        const employer = await prisma_1.prisma.employer.findUnique({ where: { id: employerId } });
        if (!employer)
            return res.status(404).json({ error: 'Employer not found' });
        const admin = await prisma_1.prisma.employerAdminUser.findFirst({
            where: { employerId },
            orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
            select: { email: true },
        });
        const to = admin === null || admin === void 0 ? void 0 : admin.email;
        if (!to)
            return res.status(400).json({ error: 'No admin email found for employer' });
        const plan = employer.currentPlanId
            ? await prisma_1.prisma.plan.findUnique({ where: { id: employer.currentPlanId } })
            : null;
        let subject = 'Test';
        let html = '<p>Hello</p>';
        const now = new Date();
        const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);
        if (type === 'trial') {
            const t = (0, emailTemplates_1.trialStartedTemplate)(employer.displayName || 'Perusahaan Anda', (plan === null || plan === void 0 ? void 0 : plan.name) || 'Plan', soon.toISOString());
            subject = t.subject;
            html = t.html;
        }
        else if (type === 'paid') {
            const t = (0, emailTemplates_1.paymentSuccessTemplate)(employer.displayName || 'Perusahaan Anda', (plan === null || plan === void 0 ? void 0 : plan.name) || 'Plan', soon.toISOString());
            subject = t.subject;
            html = t.html;
        }
        else if (type === 'warn3') {
            const t = (0, emailTemplates_1.willExpireTemplate)(employer.displayName || 'Perusahaan Anda', 3, soon.toISOString());
            subject = t.subject;
            html = t.html;
        }
        else if (type === 'warn1') {
            const t = (0, emailTemplates_1.willExpireTemplate)(employer.displayName || 'Perusahaan Anda', 1, soon.toISOString());
            subject = t.subject;
            html = t.html;
        }
        else if (type === 'expired') {
            const t = (0, emailTemplates_1.expiredTemplate)(employer.displayName || 'Perusahaan Anda', now.toISOString());
            subject = t.subject;
            html = t.html;
        }
        await (0, mailer_1.sendEmail)(to, subject, html);
        res.json({ ok: true, sentTo: to, subject });
    }
    catch (e) {
        res.status(500).json({ error: (e === null || e === void 0 ? void 0 : e.message) || 'fail' });
    }
});
exports.default = r;
