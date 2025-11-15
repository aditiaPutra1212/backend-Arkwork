"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.transporter = exports.SMTP_FROM = void 0;
exports.sendEmail = sendEmail;
exports.sendVerificationEmail = sendVerificationEmail;
exports.sendPasswordResetEmail = sendPasswordResetEmail;
const nodemailer_1 = __importDefault(require("nodemailer"));
const SMTP_HOST = process.env.SMTP_HOST || '';
const SMTP_PORT = Number(process.env.SMTP_PORT || 587);
const SMTP_USER = process.env.SMTP_USER || '';
const SMTP_PASS = process.env.SMTP_PASS || '';
// Use SMTP_USER as fallback FROM, common for Gmail
const SMTP_FROM = process.env.SMTP_FROM || SMTP_USER || '"ArkWork System" <no-reply@arkwork.app>';
exports.SMTP_FROM = SMTP_FROM;
let transporter = null;
exports.transporter = transporter;
// Only create transporter if config is present
if (SMTP_HOST && SMTP_USER && SMTP_PASS) {
    exports.transporter = transporter = nodemailer_1.default.createTransport({
        host: SMTP_HOST,
        port: SMTP_PORT,
        secure: SMTP_PORT === 465, // true for 465, false for other ports
        auth: {
            user: SMTP_USER,
            pass: SMTP_PASS,
        },
    });
    // Verify connection on startup
    transporter.verify(function (error, success) {
        if (error) {
            console.error('[Mailer] SMTP Connection Error:', error);
            exports.transporter = transporter = null; // Disable mailing if connection fails
        }
        else {
            console.log('[Mailer] SMTP Server is ready:', { host: SMTP_HOST, port: SMTP_PORT, from: SMTP_FROM });
        }
    });
}
else {
    console.warn('[Mailer] SMTP environment variables not fully set. Email sending disabled.');
}
/**
 * Sends an email using the configured transporter.
 * Throws an error if the mailer is not configured or sending fails.
 */
async function sendEmail(to, subject, html, text) {
    if (!transporter) {
        console.error('[Mailer][sendEmail] Attempted to send email but transporter is not configured.');
        throw new Error('Mailer is not configured properly.'); // Throw error if disabled
    }
    const toHeader = Array.isArray(to) ? to.join(',') : to;
    try {
        const info = await transporter.sendMail({
            from: SMTP_FROM, // Use configured FROM address
            to: toHeader,
            subject,
            text, // Plain text version
            html, // HTML version
        });
        console.log(`[Mailer][sendEmail] Email sent successfully to ${toHeader} | Subject: "${subject}" | Message ID: ${info.messageId}`);
        return info;
    }
    catch (error) {
        console.error(`[Mailer][sendEmail] Failed to send email to ${toHeader} | Subject: "${subject}" | Error:`, error);
        throw error; // Re-throw the error to be handled by the caller
    }
}
/**
 * Sends a verification email to a new user.
 * @param toEmail Recipient's email address.
 * @param name Recipient's name (or 'User' if not provided).
 * @param verificationUrl The unique URL for the user to click.
 */
async function sendVerificationEmail(toEmail, name, verificationUrl) {
    // Ensure mailer is ready before proceeding
    if (!transporter) {
        console.error('[Mailer][sendVerificationEmail] Mailer not configured, skipping verification email.');
        throw new Error('Mailer is not configured properly, cannot send verification email.');
    }
    const subject = 'Verify Your ArkWork Account Email';
    // Use 'User' as a fallback if name is null or empty
    const recipientName = (name === null || name === void 0 ? void 0 : name.trim()) || 'User';
    // Plain text content
    const text = `Hello ${recipientName},\n\nPlease verify your email address by clicking the following link:\n${verificationUrl}\n\nThis link will expire in 1 hour.\n\nIf you did not create this account, please ignore this email.\n\nThanks,\nThe ArkWork Team`;
    // HTML content with a clickable link
    const html = `
    <p>Hello ${recipientName},</p>
    <p>Thank you for registering with ArkWork! Please verify your email address by clicking the link below:</p>
    <p style="margin: 20px 0;">
      <a href="${verificationUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Verify Email Address</a>
    </p>
    <p>This verification link will expire in <strong>1 hour</strong>.</p>
    <p>If you did not create this account, please disregard this email.</p>
    <p>Thanks,<br/>The ArkWork Team</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 20px;" />
    <p style="font-size: 0.8em; color: #6b7280;">If you're having trouble clicking the button, copy and paste this URL into your web browser: ${verificationUrl}</p>
  `;
    try {
        // Use the existing sendEmail function
        await sendEmail(toEmail, subject, html, text);
        // Success log is already inside sendEmail
    }
    catch (error) {
        // Error log is already inside sendEmail, but re-throw it
        // so the signup handler knows the email failed.
        console.error(`[Mailer][sendVerificationEmail] Specific error during verification email send to ${toEmail}:`, error);
        throw error;
    }
}
// --- TAMBAHAN UNTUK FORGOT PASSWORD ---
/**
 * Sends a password reset email.
 * @param toEmail Recipient's email address.
 * @param name Recipient's name (or 'User' if not provided).
 * @param resetUrl The unique URL for the user to click to reset password.
 */
async function sendPasswordResetEmail(toEmail, name, resetUrl) {
    if (!transporter) {
        console.error('[Mailer][sendPasswordResetEmail] Mailer not configured, skipping reset email.');
        throw new Error('Mailer is not configured properly, cannot send reset email.');
    }
    const subject = 'Your ArkWork Password Reset Request';
    const recipientName = (name === null || name === void 0 ? void 0 : name.trim()) || 'User';
    // Plain text content
    const text = `Hello ${recipientName},\n\nWe received a request to reset your password. Click the link below to set a new one:\n${resetUrl}\n\nThis link will expire in 15 minutes.\n\nIf you did not request this, please ignore this email.\n\nThanks,\nThe ArkWork Team`;
    // HTML content
    const html = `
    <p>Hello ${recipientName},</p>
    <p>We received a request to reset the password for your ArkWork account. Please click the button below to set a new password:</p>
    <p style="margin: 20px 0;">
      <a href="${resetUrl}" target="_blank" rel="noopener noreferrer" style="background-color: #3b82f6; color: white; padding: 10px 20px; text-decoration: none; border-radius: 5px; font-weight: bold;">Reset Your Password</a>
    </p>
    <p>This password reset link will expire in <strong>15 minutes</strong>.</p>
    <p>If you did not request a password reset, please ignore this email.</p>
    <p>Thanks,<br/>The ArkWork Team</p>
    <hr style="border: none; border-top: 1px solid #e5e7eb; margin-top: 20px;" />
    <p style="font-size: 0.8em; color: #6b7280;">If you're having trouble clicking the button, copy and paste this URL into your web browser: ${resetUrl}</p>
  `;
    try {
        await sendEmail(toEmail, subject, html, text);
    }
    catch (error) {
        console.error(`[Mailer][sendPasswordResetEmail] Specific error during password reset email send to ${toEmail}:`, error);
        throw error;
    }
}
