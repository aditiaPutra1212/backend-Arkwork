import { prisma } from '../lib/prisma';
import { z } from 'zod';

/* ======================= Helpers ======================= */
const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/['"]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)+/g, '') || 'company';

async function ensureUniqueSlug(base: string): Promise<string> {
  const root = slugify(base);
  let slug = root;
  let i = 1;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    const exist = await prisma.employer.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!exist) return slug;
    slug = `${root}-${i++}`;
  }
}

/* ---------- URL normalizer: tambah https://; izinkan data: ---------- */
function normalizeUrlLoose(v?: unknown): string | undefined {
  const raw = String(v ?? '').trim();
  if (!raw) return undefined;
  if (/^data:/i.test(raw)) return raw; // data URL (logo/banner)
  let s = raw;
  if (!/^https?:\/\//i.test(s)) s = `https://${s}`;
  try {
    const u = new URL(s);
    return u.toString();
  } catch {
    return undefined; // abaikan bila tetap tidak valid
  }
}

/* ---------- Zod helper untuk URL longgar ---------- */
const LooseUrl = z
  .union([z.string(), z.undefined(), z.null()])
  .transform((v) => normalizeUrlLoose(v ?? undefined))
  .optional();

/* ======================= Schemas (service-level) ======================= */
const CheckAvailabilityInput = z.object({
  slug: z.string().optional(),
  email: z.string().email().optional(),
});

const CreateAccountInput = z.object({
  companyName: z.string().min(2),
  displayName: z.string().min(2),
  email: z.string().email(),
  website: LooseUrl,
  password: z.string().min(8),
});

const UpsertProfileInput = z.object({
  industry: z.string().optional(),
  size: z.any().optional(),
  foundedYear: z.number().int().optional(),
  about: z.string().optional(),
  logoUrl: LooseUrl,   // http(s) atau data:
  bannerUrl: LooseUrl,
  hqCity: z.string().optional(),
  hqCountry: z.string().optional(),
  linkedin: LooseUrl,
  instagram: LooseUrl,
  twitter: LooseUrl,
});

const ChoosePlanInput = z.object({
  employerId: z.string().uuid(),
  planSlug: z.string().min(1),
});

const CreateDraftJobInput = z.object({
  employerId: z.string().uuid(),
  title: z.string().min(2),
  description: z.string().optional(),
  location: z.string().optional(),
  employment: z.string().optional(),
});

const SubmitVerificationInput = z.object({
  employerId: z.string().uuid(),
  note: z.string().optional(),
  files: z
    .array(
      z.object({
        url: LooseUrl.unwrap(),      // string | undefined
        type: z.string().optional(),
      })
    )
    .optional(),
});

/* ======================= Public API ======================= */

export async function checkAvailability(params: { slug?: string; email?: string }) {
  const input = CheckAvailabilityInput.parse(params);
  const out: Record<string, boolean> = {};

  if (input.slug) {
    const s = slugify(input.slug);
    out.slugTaken = !!(await prisma.employer.findUnique({
      where: { slug: s },
      select: { id: true },
    }));
  }
  if (input.email) {
    const email = input.email.toLowerCase();
    out.emailTaken = !!(await prisma.employerAdminUser.findUnique({
      where: { email },
      select: { id: true },
    }));
  }
  return out;
}

/**
 * createAccount
 */
export async function createAccount(input: {
  companyName: string;
  displayName: string;
  email: string;
  website?: string;
  password: string;
}) {
  const data = CreateAccountInput.parse(input);
  const email = data.email.toLowerCase();

  // Pastikan email belum dipakai
  const exist = await prisma.employerAdminUser.findUnique({
    where: { email },
    select: { id: true },
  });
  if (exist) {
    throw Object.assign(new Error('Email already used'), { status: 409, code: 'EMAIL_TAKEN' });
  }

  const slug = await ensureUniqueSlug(data.displayName);

  // hashPassword milikmu (lib/hash)
  const { hashPassword } = await import('../lib/hash');
  const passwordHash = await hashPassword(data.password);

  const result = await prisma.$transaction(async (tx) => {
    const employer = await tx.employer.create({
      data: {
        slug,
        legalName: data.companyName,
        displayName: data.displayName,
        website: data.website ?? null,
        status: 'draft',
        onboardingStep: 'PACKAGE',
      },
      select: { id: true },
    });

    await tx.employerAdminUser.create({
      data: {
        employerId: employer.id,
        email,
        passwordHash,
        isOwner: true,
        agreedTosAt: new Date(),
      },
      select: { id: true },
    });

    return { employerId: employer.id };
  });

  return { employerId: result.employerId, slug };
}

/**
 * upsertProfile
 */
export async function upsertProfile(employerId: string, profile: unknown) {
  const body = UpsertProfileInput.parse(profile);

  await prisma.employerProfile.upsert({
    where: { employerId },
    update: body,
    create: { employerId, ...body },
  });

  await prisma.employer
    .update({
      where: { id: employerId },
      data: { onboardingStep: 'PACKAGE' },
    })
    .catch(() => {});

  return { ok: true };
}

/**
 * choosePlan
 */
export async function choosePlan(employerId: string, planSlug: string) {
  const { employerId: eid, planSlug: pslug } = ChoosePlanInput.parse({
    employerId,
    planSlug,
  });

  const plan = await prisma.plan.findUnique({
    where: { slug: pslug },
    select: { id: true },
  });
  if (!plan) throw Object.assign(new Error('Plan not found'), { status: 404 });

  await prisma.$transaction(async (tx) => {
    const exist = await tx.subscription.findFirst({
      where: { employerId: eid, planId: plan.id, status: 'active' },
      select: { id: true },
    });
    if (!exist) {
      await tx.subscription.create({
        data: {
          employerId: eid,
          planId: plan.id,
          status: 'active',
        },
        select: { id: true },
      });
    }

    await tx.employer.update({
      where: { id: eid },
      data: { onboardingStep: 'JOB' },
    });
  });

  return { ok: true };
}

/**
 * createDraftJob
 */
export async function createDraftJob(
  employerId: string,
  data: { title: string; description?: string; location?: string; employment?: string }
) {
  const body = CreateDraftJobInput.parse({ employerId, ...data });

  const job = await prisma.$transaction(async (tx) => {
    const j = await tx.job.create({
      data: {
        employerId: body.employerId,
        title: body.title,
        description: body.description,
        location: body.location,
        employment: body.employment,
        isDraft: true,
        isActive: false,
      },
      select: { id: true, title: true },
    });

    await tx.employer.update({
      where: { id: body.employerId },
      data: { onboardingStep: 'VERIFY' },
    });

    return j;
  });

  return { ok: true, jobId: job.id };
}

/**
 * submitVerification
 */
export async function submitVerification(
  employerId: string,
  note?: string,
  files?: { url: string; type?: string }[]
) {
  const body = SubmitVerificationInput.parse({ employerId, note, files });

  const vr = await prisma.$transaction(async (tx) => {
    const req = await tx.verificationRequest.create({
      data: { employerId: body.employerId, status: 'pending', note: body.note },
      select: { id: true },
    });

    if (body.files?.length) {
      await tx.verificationFile.createMany({
        data: body.files
          .map((f) => ({ ...f, url: normalizeUrlLoose(f.url) }))
          .filter((f): f is { url: string; type?: string } => !!f.url)
          .map((f) => ({
            verificationId: req.id,
            fileUrl: f.url,
            fileType: f.type,
          })),
      });
    }

    await tx.employer.update({
      where: { id: body.employerId },
      data: { onboardingStep: 'DONE' },
    });

    return req;
  });

  return { ok: true, verificationId: vr.id };
}
