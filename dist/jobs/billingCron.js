"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.startBillingCron = startBillingCron;
// backend/src/jobs/billingCron.ts
const node_cron_1 = __importDefault(require("node-cron"));
const mailer_1 = require("../lib/mailer");
const billing_1 = require("../services/billing");
function startBillingCron() {
    // Recompute pass: cukup log ringan (status akan diurus webhook & job lain).
    node_cron_1.default.schedule('30 0 * * *', async () => {
        try {
            console.log('[billingCron] recompute tick');
        }
        catch (e) {
            console.error('[billingCron] recompute error', e);
        }
    });
    // Kirim warning jam 09:00 setiap hari
    node_cron_1.default.schedule('0 9 * * *', async () => {
        try {
            const toWarn = await (0, billing_1.findEmployersToWarn)([7, 3, 1]);
            console.log(`[billingCron] warn candidates: ${toWarn.length}`);
            for (const item of toWarn) {
                const emails = item.adminEmails;
                if (emails.length === 0)
                    continue;
                const kind = item.type === 'trial' ? 'masa trial' : 'masa premium';
                const left = (0, billing_1.leftDaysText)(item.warnForDate);
                const subject = `Peringatan: ${kind} ${item.employer.displayName} berakhir ${left}`;
                const html = `
          <p>Halo tim ${item.employer.displayName},</p>
          <p>Ini pengingat bahwa <b>${kind}</b> Anda akan berakhir <b>${left}</b> (tanggal: ${new Date(item.warnForDate).toLocaleDateString('id-ID')}).</p>
          <p>Silakan perpanjang untuk menghindari gangguan layanan.</p>
          <p>— ArkWork Billing</p>
        `;
                await (0, mailer_1.sendEmail)(emails, subject, html);
                console.log(`[billingCron] warning sent -> ${emails.join(',')}`);
            }
        }
        catch (e) {
            console.error('[billingCron] warn job error', e);
        }
    });
}
startBillingCron();
