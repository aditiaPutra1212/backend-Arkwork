// backend/src/services/midtrans.ts
import midtransClient from 'midtrans-client';
import { prisma } from '../lib/prisma';
import { activatePremium, recomputeBillingStatus } from './billing';

/* ================= ENV & Guards ================= */

// Support beberapa var supaya gak kejeglong
const IS_PRODUCTION =
  String(
    process.env.MIDTRANS_PRODUCTION ??
      process.env.MIDTRANS_PROD ??
      process.env.MIDTRANS_IS_PROD ??
      'false',
  ).toLowerCase() === 'true';

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
  console.warn(
    '[Midtrans] Mode SANDBOX (MIDTRANS_PRODUCTION=false), tetapi key tampak non-SB. ' +
      'Pastikan key yang dipakai memang milik environment Sandbox & merchant yang sama.',
  );
}
if (IS_PRODUCTION && (looksSBServer || looksSBClient)) {
  console.warn('[Midtrans] Mode PRODUCTION, tetapi key tampak sandbox (SB-). Periksa kembali.');
}

/* ================= SNAP CLIENT ================= */
export const snap = new midtransClient.Snap({
  isProduction: IS_PRODUCTION,
  serverKey: MIDTRANS_SERVER_KEY,
  clientKey: MIDTRANS_CLIENT_KEY,
});

/* ================= Types ================= */
export type CreateSnapForPlanParams = {
  planId: string;
  userId?: string | null;
  employerId?: string | null;
  enabledPayments?: string[];
  customer?: {
    first_name?: string;
    last_name?: string;
    email?: string;
    phone?: string;
  };
};

export type MidtransNotificationPayload = {
  order_id: string;
  status_code: string;
  gross_amount: string; // string dari Midtrans
  signature_key: string;
  transaction_status:
    | 'capture'
    | 'settlement'
    | 'pending'
    | 'deny'
    | 'cancel'
    | 'expire'
    | 'failure'
    | 'refund'
    | 'chargeback';
  payment_type?: string;
  fraud_status?: 'accept' | 'challenge' | 'deny';
  transaction_id?: string;
  [k: string]: any;
};

/* ================= Helpers ================= */
async function getPlanByIdOrSlug(planId: string) {
  const byId = await prisma.plan.findFirst({ where: { id: planId } });
  if (byId) return byId;
  return prisma.plan.findFirst({ where: { slug: planId } });
}

// order_id Midtrans max 50 char → pakai prefix + slug (lebih pendek) + timestamp
function newOrderId(prefix: string, slugOrId: string) {
  const base = `${prefix}-${String(slugOrId)}`.slice(0, 28); // sisa untuk -ts
  return `${base}-${Date.now()}`;
}

function verifySignature(p: MidtransNotificationPayload) {
  const crypto = require('node:crypto') as typeof import('node:crypto');
  const raw = `${p.order_id}${p.status_code}${p.gross_amount}${MIDTRANS_SERVER_KEY}`;
  const expected = crypto.createHash('sha512').update(raw).digest('hex');
  return expected === p.signature_key;
}

function mapStatus(p: MidtransNotificationPayload) {
  const ts = p.transaction_status;
  const fraud = p.fraud_status;
  if (ts === 'capture') {
    if (fraud === 'accept') return 'settlement';
    if (fraud === 'challenge') return 'challenge';
    return 'rejected';
  }
  if (ts === 'settlement') return 'settlement';
  if (ts === 'pending') return 'pending';
  if (ts === 'deny') return 'deny';
  if (ts === 'cancel') return 'cancel';
  if (ts === 'expire') return 'expire';
  if (ts === 'failure') return 'failure';
  if (ts === 'refund') return 'refund';
  if (ts === 'chargeback') return 'chargeback';
  return ts;
}

/* ================= Public APIs ================= */
export async function createSnapForPlan(params: CreateSnapForPlanParams) {
  const { planId, userId, employerId, enabledPayments, customer } = params;

  const plan = await getPlanByIdOrSlug(planId);
  if (!plan) throw new Error('Plan not found');

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

  const payload: any = {
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

  console.log('[Midtrans] createTransaction payload:', {
    isProduction: IS_PRODUCTION,
    orderId,
    grossAmount,
    origin: FRONTEND_ORIGIN,
  });

  let res: { token: string; redirect_url: string };
  try {
    res = (await snap.createTransaction(payload)) as any;
  } catch (e: any) {
    const api = e?.ApiResponse;
    console.error('[Midtrans] createTransaction error:', api || e);
    const msg =
      api?.status_message ||
      api?.error_messages?.[0] ||
      e?.message ||
      'Midtrans createTransaction failed';
    throw new Error(msg);
  }

  // Simpan payment (grossAmount adalah BigInt di DB)
  await prisma.payment.create({
    data: {
      orderId,
      planId: plan.id,
      employerId: employerId ?? null,
      userId: userId ?? null,
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

export async function handleMidtransNotification(raw: any) {
  const p = raw as MidtransNotificationPayload;

  // payload basic guard
  for (const k of ['order_id', 'status_code', 'gross_amount', 'signature_key']) {
    if (!p || typeof (p as any)[k] !== 'string' || !(p as any)[k]) {
      return { ok: false, reason: 'BAD_PAYLOAD', k };
    }
  }
  if (!verifySignature(p)) return { ok: false, reason: 'INVALID_SIGNATURE' };

  const mapped = mapStatus(p);

  // Ambil payment yang relevan + status lama untuk idempotency
  const pay = await prisma.payment.findUnique({
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
  await prisma.payment.updateMany({
    where: { orderId: p.order_id },
    data: {
      status: mapped,
      method: p.payment_type ?? undefined,
      transactionId: p.transaction_id ?? undefined,
      fraudStatus: p.fraud_status ?? undefined,
      meta: { set: { ...(p as any), updatedAt: new Date().toISOString() } },
    },
  });

  // Jika sukses & belum pernah settlement → aktifkan premium
  const isSuccess =
    mapped === 'settlement' || (p.transaction_status === 'capture' && p.fraud_status === 'accept');

  if (isSuccess && pay && pay.status !== 'settlement') {
    try {
      // ambil plan untuk interval
      const plan = await prisma.plan.findUnique({
        where: { id: pay.planId! },
        select: { id: true, interval: true },
      });

      if (pay.employerId && plan?.interval) {
        console.log('[Midtrans] Activating premium for employer', pay.employerId, 'interval=', plan.interval);
        await activatePremium({
          employerId: pay.employerId,
          planId: plan.id,
          interval: (plan.interval as 'month' | 'year') || 'month',
        });
        await recomputeBillingStatus(pay.employerId);
      } else {
        console.warn(
          '[Midtrans] Cannot activate premium. employerId or plan.interval missing',
          { employerId: pay?.employerId, planId: plan?.id, interval: plan?.interval },
        );
      }
    } catch (e) {
      console.error('[Midtrans] activatePremium failed:', e);
    }
  }

  return { ok: true, order_id: p.order_id, status: mapped };
}
