"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.trialStartedTemplate = trialStartedTemplate;
exports.paymentSuccessTemplate = paymentSuccessTemplate;
exports.renewalSuccessTemplate = renewalSuccessTemplate;
exports.willExpireTemplate = willExpireTemplate;
exports.expiredTemplate = expiredTemplate;
function trialStartedTemplate(company, plan, endISO) {
    const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
    return {
        subject: `Trial ${plan} aktif hingga ${end}`,
        html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Trial paket <b>${plan}</b> Anda sudah aktif.</p>
      <p>Masa trial berakhir pada <b>${end}</b>. Silakan upgrade sebelum berakhir untuk tetap menikmati fitur premium.</p>
      <p>Terima kasih,<br/>Tim ArkWork</p>
    `
    };
}
function paymentSuccessTemplate(company, plan, endISO) {
    const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
    return {
        subject: `Pembayaran berhasil — ${plan} aktif sampai ${end}`,
        html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Pembayaran berhasil. Paket <b>${plan}</b> sudah aktif.</p>
      <p>Periode Anda berlaku sampai <b>${end}</b>.</p>
      <p>Terima kasih telah berlangganan ArkWork!</p>
    `
    };
}
function renewalSuccessTemplate(company, plan, endISO) {
    const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
    return {
        subject: `Langganan diperpanjang — aktif sampai ${end}`,
        html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Perpanjangan paket <b>${plan}</b> berhasil. Berlaku sampai <b>${end}</b>.</p>
      <p>Terima kasih!</p>
    `
    };
}
function willExpireTemplate(company, leftDays, endISO) {
    const end = new Date(endISO).toLocaleString('id-ID', { dateStyle: 'medium' });
    return {
        subject: `Pengingat: ${leftDays} hari lagi langganan berakhir`,
        html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Langganan Anda akan berakhir dalam <b>${leftDays} hari</b> (tanggal <b>${end}</b>).</p>
      <p>Silakan perpanjang untuk menghindari penghentian fitur premium.</p>
    `
    };
}
function expiredTemplate(company, endedISO) {
    const ended = new Date(endedISO).toLocaleString('id-ID', { dateStyle: 'medium' });
    return {
        subject: `Langganan berakhir (${ended})`,
        html: `
      <p>Halo <b>${company}</b>,</p>
      <p>Langganan Anda telah berakhir pada <b>${ended}</b>. Anda masih bisa memperpanjang kapan saja untuk kembali ke fitur premium.</p>
      <p>Terima kasih.</p>
    `
    };
}
