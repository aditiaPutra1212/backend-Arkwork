"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transporter = void 0;
exports.sendMail = sendMail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
const SMTP_FROM = process.env.SMTP_FROM || '"ArkWork Billing" <no-reply@arkwork.app>';
if (!SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.warn('[mailer] SMTP env not fully set. Emails will likely fail.');
}
exports.transporter = nodemailer_1.default.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: { user: SMTP_USER, pass: SMTP_PASS },
});
async function sendMail(opts) {
    const to = Array.isArray(opts.to) ? opts.to.join(',') : opts.to;
    const info = await exports.transporter.sendMail({
        from: SMTP_FROM,
        to,
        subject: opts.subject,
        text: opts.text,
        html: opts.html,
    });
    return info;
}
