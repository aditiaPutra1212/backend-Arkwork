"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.snap = void 0;
exports.createSnapForPlan = createSnapForPlan;
exports.handleMidtransNotification = handleMidtransNotification;
const midtrans_client_1 = __importDefault(require("midtrans-client"));
const prisma_1 = require("../lib/prisma");
/* ================= ENV & Guards ================= */
// Support beberapa var supaya gak kejeglong
const IS_PRODUCTION = String(process.env.MIDTRANS_PRODUCTION ??
    process.env.MIDTRANS_PROD ??
    process.env.MIDTRANS_IS_PROD ??
    'false').toLowerCase() === 'true';
const MIDTRANS_SERVER_KEY = String(process.env.MIDTRANS_SERVER_KEY || '').trim();
const MIDTRANS_CLIENT_KEY = String(process.env.MIDTRANS_CLIENT_KEY || '').trim();
const FRONTEND_ORIGIN = (process.env.FRONTEND_ORIGIN ?? 'http://localhost:3000')
    .split(',')[0]
    .trim();
if (!MIDTRANS_SERVER_KEY || !MIDTRANS_CLIENT_KEY) {
    throw new Error('MIDTRANS_SERVER_KEY / MIDTRANS_CLIENT_KEY belum di-set');
}
// Informational guards (hanya warning)
const looksSBServer = MIDTRANS_SERVER_KEY.startsWith('SB-');
const looksSBClient = MIDTRANS_CLIENT_KEY.startsWith('SB-');
if (!IS_PRODUCTION && (!looksSBServer || !looksSBClient)) {
    console.warn('[Midtrans] Mode SANDBOX (MIDTRANS_PRODUCTION=false), tetapi key tampak non-SB. ' +
        'Pastikan key yang dipakai memang milik environment Sandbox & merchant yang sama.');
}
if (IS_PRODUCTION && (looksSBServer || looksSBClient)) {
    console.warn('[Midtrans] Mode PRODUCTION, tetapi key tampak sandbox (SB-). Periksa kembali.');
}
/* ================= SNAP CLIENT ================= */
exports.snap = new midtrans_client_1.default.Snap({
    isProduction: IS_PRODUCTION,
    serverKey: MIDTRANS_SERVER_KEY,
    clientKey: MIDTRANS_CLIENT_KEY,
});
/* ================= Helpers ================= */
async function getPlanByIdOrSlug(planId) {
    const byId = await prisma_1.prisma.plan.findFirst({ where: { id: planId } });
    if (byId)
        return byId;
    return prisma_1.prisma.plan.findFirst({ where: { slug: planId } });
}
// order_id Midtrans max 50 char → pakai prefix + slug (lebih pendek) + timestamp
function newOrderId(prefix, slugOrId) {
    const base = `${prefix}-${String(slugOrId)}`.slice(0, 28); // sisa untuk -ts
    return `${base}-${Date.now()}`;
}
function verifySignature(p) {
    const crypto = require('node:crypto');
    const raw = `${p.order_id}${p.status_code}${p.gross_amount}${MIDTRANS_SERVER_KEY}`;
    const expected = crypto.createHash('sha512').update(raw).digest('hex');
    return expected === p.signature_key;
}
function mapStatus(p) {
    const ts = p.transaction_status;
    const fraud = p.fraud_status;
    if (ts === 'capture') {
        if (fraud === 'accept')
            return 'settlement';
        if (fraud === 'challenge')
            return 'challenge';
        return 'rejected';
    }
    if (ts === 'settlement')
        return 'settlement';
    if (ts === 'pending')
        return 'pending';
    if (ts === 'deny')
        return 'deny';
    if (ts === 'cancel')
        return 'cancel';
    if (ts === 'expire')
        return 'expire';
    if (ts === 'failure')
        return 'failure';
    if (ts === 'refund')
        return 'refund';
    if (ts === 'chargeback')
        return 'chargeback';
    return ts;
}
/* ================= Public APIs ================= */
async function createSnapForPlan(params) {
    const { planId, userId, employerId, enabledPayments, customer } = params;
    const plan = await getPlanByIdOrSlug(planId);
    if (!plan)
        throw new Error('Plan not found');
    // Prisma BigInt → number
    const grossAmount = Number(plan.amount);
    if (!Number.isFinite(grossAmount) || grossAmount <= 0) {
        throw new Error('Invalid plan amount');
    }
    if (Math.floor(grossAmount) !== grossAmount) {
        throw new Error('gross_amount harus bilangan bulat (Rupiah)');
    }
    const shortKey = plan.slug || planId;
    const orderId = newOrderId('plan', shortKey);
    const payload = {
        transaction_details: { order_id: orderId, gross_amount: grossAmount },
        item_details: [
            {
                id: String(plan.id),
                price: grossAmount,
                quantity: 1,
                name: plan.name ?? `Plan ${plan.slug}`,
            },
        ],
        customer_details: {
            first_name: customer?.first_name ?? 'User',
            last_name: customer?.last_name ?? (userId || 'guest'),
            email: customer?.email,
            phone: customer?.phone,
        },
        credit_card: { secure: true },
        callbacks: {
            finish: `${FRONTEND_ORIGIN}/payments/finish`,
            pending: `${FRONTEND_ORIGIN}/payments/pending`,
            error: `${FRONTEND_ORIGIN}/payments/error`,
        },
    };
    if (Array.isArray(enabledPayments) && enabledPayments.length > 0) {
        payload.enabled_payments = enabledPayments;
    }
    // Log ringan untuk diagnosa (cek di server)
    console.log('[Midtrans] createTransaction payload:', {
        isProduction: IS_PRODUCTION,
        orderId,
        grossAmount,
        origin: FRONTEND_ORIGIN,
    });
    let res;
    try {
        res = await exports.snap.createTransaction(payload);
    }
    catch (e) {
        const api = e?.ApiResponse;
        console.error('[Midtrans] createTransaction error:', api || e);
        const msg = api?.status_message ||
            api?.error_messages?.[0] ||
            e?.message ||
            'Midtrans createTransaction failed';
        throw new Error(msg);
    }
    // Simpan payment (grossAmount adalah BigInt di DB)
    await prisma_1.prisma.payment.create({
        data: {
            orderId,
            planId: plan.id,
            employerId: employerId ?? null,
            userId: userId ?? null,
            currency: 'IDR',
            grossAmount: BigInt(grossAmount), // <== penting untuk Prisma BigInt
            status: 'pending',
            token: res.token,
            redirectUrl: res.redirect_url,
            meta: { provider: 'midtrans', createdAt: new Date().toISOString() },
        },
    });
    return { token: res.token, redirect_url: res.redirect_url, order_id: orderId };
}
async function handleMidtransNotification(raw) {
    const p = raw;
    for (const k of ['order_id', 'status_code', 'gross_amount', 'signature_key']) {
        if (!p || typeof p[k] !== 'string' || !p[k]) {
            return { ok: false, reason: 'BAD_PAYLOAD', k };
        }
    }
    if (!verifySignature(p))
        return { ok: false, reason: 'INVALID_SIGNATURE' };
    const status = mapStatus(p);
    await prisma_1.prisma.payment.updateMany({
        where: { orderId: p.order_id },
        data: {
            status,
            method: p.payment_type ?? undefined,
            transactionId: p.transaction_id ?? undefined,
            fraudStatus: p.fraud_status ?? undefined,
            meta: { set: { ...p, updatedAt: new Date().toISOString() } },
        },
    });
    return { ok: true, order_id: p.order_id, status };
}
