import { Router } from 'express';
import { prisma } from '../lib/prisma';
import { sendEmail } from '../lib/mailer';
import { trialStartedTemplate, paymentSuccessTemplate, willExpireTemplate, expiredTemplate } from '../lib/emailTemplates';

const r = Router();

// GET /dev/mail/try?employerId=...&type=trial|paid|warn3|warn1|expired
r.get('/dev/mail/try', async (req, res) => {
  try {
    const { employerId, type = 'trial' } = req.query as any;
    if (!employerId) return res.status(400).json({ error: 'employerId required' });

    const employer = await prisma.employer.findUnique({ where: { id: employerId } });
    if (!employer) return res.status(404).json({ error: 'Employer not found' });

    const admin = await prisma.employerAdminUser.findFirst({
      where: { employerId },
      orderBy: [{ isOwner: 'desc' }, { createdAt: 'asc' }],
      select: { email: true },
    });
    const to = admin?.email;
    if (!to) return res.status(400).json({ error: 'No admin email found for employer' });

    const plan = employer.currentPlanId
      ? await prisma.plan.findUnique({ where: { id: employer.currentPlanId } })
      : null;

    let subject = 'Test';
    let html = '<p>Hello</p>';
    const now = new Date();
    const soon = new Date(now.getTime() + 3 * 24 * 3600 * 1000);

    if (type === 'trial') {
      const t = trialStartedTemplate(employer.displayName || 'Perusahaan Anda', plan?.name || 'Plan', soon.toISOString());
      subject = t.subject; html = t.html;
    } else if (type === 'paid') {
      const t = paymentSuccessTemplate(employer.displayName || 'Perusahaan Anda', plan?.name || 'Plan', soon.toISOString());
      subject = t.subject; html = t.html;
    } else if (type === 'warn3') {
      const t = willExpireTemplate(employer.displayName || 'Perusahaan Anda', 3, soon.toISOString());
      subject = t.subject; html = t.html;
    } else if (type === 'warn1') {
      const t = willExpireTemplate(employer.displayName || 'Perusahaan Anda', 1, soon.toISOString());
      subject = t.subject; html = t.html;
    } else if (type === 'expired') {
      const t = expiredTemplate(employer.displayName || 'Perusahaan Anda', now.toISOString());
      subject = t.subject; html = t.html;
    }

    await sendEmail(to, subject, html);
    res.json({ ok: true, sentTo: to, subject });
  } catch (e: any) {
    res.status(500).json({ error: e?.message || 'fail' });
  }
});

export default r;
