// backend/src/jobs/billingCron.ts
import cron from 'node-cron';
import { sendEmail } from '../lib/mailer';
import { findEmployersToWarn, leftDaysText } from '../services/billing';

export function startBillingCron() {
  // Recompute pass: cukup log ringan (status akan diurus webhook & job lain).
  cron.schedule('30 0 * * *', async () => {
    try {
      console.log('[billingCron] recompute tick');
    } catch (e) {
      console.error('[billingCron] recompute error', e);
    }
  });

  // Kirim warning jam 09:00 setiap hari
  cron.schedule('0 9 * * *', async () => {
    try {
      const toWarn = await findEmployersToWarn([7, 3, 1]);
      console.log(`[billingCron] warn candidates: ${toWarn.length}`);

      for (const item of toWarn) {
        const emails = item.adminEmails;
        if (emails.length === 0) continue;

        const kind = item.type === 'trial' ? 'masa trial' : 'masa premium';
        const left = leftDaysText(item.warnForDate);
        const subject = `Peringatan: ${kind} ${item.employer.displayName} berakhir ${left}`;
        const html = `
          <p>Halo tim ${item.employer.displayName},</p>
          <p>Ini pengingat bahwa <b>${kind}</b> Anda akan berakhir <b>${left}</b> (tanggal: ${new Date(
            item.warnForDate
          ).toLocaleDateString('id-ID')}).</p>
          <p>Silakan perpanjang untuk menghindari gangguan layanan.</p>
          <p>— ArkWork Billing</p>
        `;

        await sendEmail(emails, subject, html);
        console.log(`[billingCron] warning sent -> ${emails.join(',')}`);
      }
    } catch (e) {
      console.error('[billingCron] warn job error', e);
    }
  });
}

startBillingCron();
