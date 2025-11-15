"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
// src/testMailer.ts
require("dotenv/config"); // <-- WAJIB: load .env
const nodemailer_1 = __importDefault(require("nodemailer"));
async function testMail() {
    // Baca env & tampilkan sekilas biar yakin terisi
    const { SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, SMTP_FROM } = process.env;
    if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
        throw new Error('ENV belum lengkap. Set: SMTP_HOST, SMTP_USER, SMTP_PASS, SMTP_FROM');
    }
    console.log('[MAIL TEST] host=%s port=%s user=%s', SMTP_HOST, SMTP_PORT, SMTP_USER);
    // Coba koneksi via 587 (STARTTLS). Kalau gagal, coba 465 (TLS).
    const transports = [
        {
            name: 'STARTTLS 587',
            cfg: {
                host: SMTP_HOST,
                port: Number(SMTP_PORT || 587),
                secure: false, // 587 pakai STARTTLS
                requireTLS: true,
                auth: { user: SMTP_USER, pass: SMTP_PASS },
                tls: { servername: SMTP_HOST }, // penting di Windows/Node baru
            },
        },
        {
            name: 'TLS 465',
            cfg: {
                host: SMTP_HOST,
                port: 465,
                secure: true, // 465 pakai TLS langsung
                auth: { user: SMTP_USER, pass: SMTP_PASS },
                tls: { servername: SMTP_HOST },
            },
        },
    ];
    let lastErr = null;
    for (const t of transports) {
        try {
            console.log(`[MAIL TEST] mencoba ${t.name} ...`);
            const transporter = nodemailer_1.default.createTransport(t.cfg);
            // opsional: verifikasi koneksi
            await transporter.verify();
            console.log(`[MAIL TEST] ${t.name} OK, mengirim email...`);
            const info = await transporter.sendMail({
                from: SMTP_FROM || SMTP_USER,
                to: SMTP_USER, // kirim ke dirimu dulu
                subject: 'Tes Email dari ArkWork',
                html: `<p>Halo 👋<br/>Ini email test dari ArkWork backend.</p>`,
            });
            console.log('✅ Email terkirim:', info.messageId);
            return;
        }
        catch (err) {
            console.warn(`❌ Gagal via ${t.name}:`, (err === null || err === void 0 ? void 0 : err.message) || err);
            lastErr = err;
        }
    }
    throw lastErr || new Error('Semua metode kirim gagal.');
}
testMail().catch((e) => {
    console.error('Gagal kirim email:', e);
    process.exit(1);
});
