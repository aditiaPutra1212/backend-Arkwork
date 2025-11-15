"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
var _a, _b, _c, _d;
Object.defineProperty(exports, "__esModule", { value: true });
exports.snap = void 0;
exports.createSnapForPlan = createSnapForPlan;
exports.handleMidtransNotification = handleMidtransNotification;
// backend/src/services/midtrans.ts
const midtrans_client_1 = __importDefault(require("midtrans-client"));
const prisma_1 = require("../lib/prisma");
const billing_1 = require("./billing");
/* ================= ENV & Guards ================= */
// Support beberapa var supaya gak kejeglong
const IS_PRODUCTION = String((_c = (_b = (_a = process.env.MIDTRANS_PRODUCTION) !== null && _a !== void 0 ? _a : process.env.MIDTRANS_PROD) !== null && _b !== void 0 ? _b : process.env.MIDTRANS_IS_PROD) !== null && _c !== void 0 ? _c : 'false').toLowerCase() === 'true';
const MIDTRANS_SERVER_KEY = String(process.env.MIDTRANS_SERVER_KEY || '').trim();
const MIDTRANS_CLIENT_KEY = String(process.env.MIDTRANS_CLIENT_KEY || '').trim();
const FRONTEND_ORIGIN = ((_d = process.env.FRONTEND_ORIGIN) !== null && _d !== void 0 ? _d : 'http://localhost:3000')
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
    var _a, _b, _c, _d;
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
                name: (_a = plan.name) !== null && _a !== void 0 ? _a : `Plan ${plan.slug}`,
            },
        ],
        customer_details: {
            first_name: (_b = customer === null || customer === void 0 ? void 0 : customer.first_name) !== null && _b !== void 0 ? _b : 'User',
            last_name: (_c = customer === null || customer === void 0 ? void 0 : customer.last_name) !== null && _c !== void 0 ? _c : (userId || 'guest'),
            email: customer === null || customer === void 0 ? void 0 : customer.email,
            phone: customer === null || customer === void 0 ? void 0 : customer.phone,
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
    console.log('[Midtrans] createTransaction payload:', {
        isProduction: IS_PRODUCTION,
        orderId,
        grossAmount,
        origin: FRONTEND_ORIGIN,
    });
    let res;
    try {
        res = (await exports.snap.createTransaction(payload));
    }
    catch (e) {
        const api = e === null || e === void 0 ? void 0 : e.ApiResponse;
        console.error('[Midtrans] createTransaction error:', api || e);
        const msg = (api === null || api === void 0 ? void 0 : api.status_message) ||
            ((_d = api === null || api === void 0 ? void 0 : api.error_messages) === null || _d === void 0 ? void 0 : _d[0]) ||
            (e === null || e === void 0 ? void 0 : e.message) ||
            'Midtrans createTransaction failed';
        throw new Error(msg);
    }
    // Simpan payment (grossAmount adalah BigInt di DB)
    await prisma_1.prisma.payment.create({
        data: {
            orderId,
            planId: plan.id,
            employerId: employerId !== null && employerId !== void 0 ? employerId : null,
            userId: userId !== null && userId !== void 0 ? userId : null,
            currency: 'IDR',
            grossAmount: BigInt(grossAmount),
            status: 'pending',
            token: res.token,
            redirectUrl: res.redirect_url,
            meta: { provider: 'midtrans', createdAt: new Date().toISOString() },
        },
    });
    return { token: res.token, redirect_url: res.redirect_url, order_id: orderId };
}
async function handleMidtransNotification(raw) {
    var _a, _b, _c;
    const p = raw;
    // payload basic guard
    for (const k of ['order_id', 'status_code', 'gross_amount', 'signature_key']) {
        if (!p || typeof p[k] !== 'string' || !p[k]) {
            return { ok: false, reason: 'BAD_PAYLOAD', k };
        }
    }
    if (!verifySignature(p))
        return { ok: false, reason: 'INVALID_SIGNATURE' };
    const mapped = mapStatus(p);
    // Ambil payment yang relevan + status lama untuk idempotency
    const pay = await prisma_1.prisma.payment.findUnique({
        where: { orderId: p.order_id },
        select: {
            id: true,
            status: true,
            employerId: true,
            planId: true,
        },
    });
    if (!pay) {
        console.warn('[Midtrans] notify for unknown order_id=', p.order_id);
    }
    // Update selalu (agar jejak status terakhir tercatat)
    await prisma_1.prisma.payment.updateMany({
        where: { orderId: p.order_id },
        data: {
            status: mapped,
            method: (_a = p.payment_type) !== null && _a !== void 0 ? _a : undefined,
            transactionId: (_b = p.transaction_id) !== null && _b !== void 0 ? _b : undefined,
            fraudStatus: (_c = p.fraud_status) !== null && _c !== void 0 ? _c : undefined,
            meta: { set: { ...p, updatedAt: new Date().toISOString() } },
        },
    });
    // Jika sukses & belum pernah settlement → aktifkan premium
    const isSuccess = mapped === 'settlement' || (p.transaction_status === 'capture' && p.fraud_status === 'accept');
    if (isSuccess && pay && pay.status !== 'settlement') {
        try {
            // ambil plan untuk interval
            const plan = await prisma_1.prisma.plan.findUnique({
                where: { id: pay.planId },
                select: { id: true, interval: true },
            });
            if (pay.employerId && (plan === null || plan === void 0 ? void 0 : plan.interval)) {
                console.log('[Midtrans] Activating premium for employer', pay.employerId, 'interval=', plan.interval);
                await (0, billing_1.activatePremium)({
                    employerId: pay.employerId,
                    planId: plan.id,
                    interval: plan.interval || 'month',
                });
                await (0, billing_1.recomputeBillingStatus)(pay.employerId);
            }
            else {
                console.warn('[Midtrans] Cannot activate premium. employerId or plan.interval missing', { employerId: pay === null || pay === void 0 ? void 0 : pay.employerId, planId: plan === null || plan === void 0 ? void 0 : plan.id, interval: plan === null || plan === void 0 ? void 0 : plan.interval });
            }
        }
        catch (e) {
            console.error('[Midtrans] activatePremium failed:', e);
        }
    }
    return { ok: true, order_id: p.order_id, status: mapped };
}
