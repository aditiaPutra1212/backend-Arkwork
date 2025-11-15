// backend/src/services/employer.ts

// ▼▼▼ PERBAIKAN 1: Tambahkan .js pada import prisma ▼▼▼
import { prisma } from '../lib/prisma.js';
import { z } from 'zod';
// Jika enum Prisma sudah di-generate, boleh import untuk type-safety kuat:
// import { OnboardingStep, EmployerStatus } from '@prisma/client';

/* ======================= Helpers ======================= */

// ▼▼▼ PERBAIKAN 2: Ubah 'await import' menjadi 'require' ▼▼▼
const { hashPassword } = require('../lib/hash.js');

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

/* ======================= Schemas (service-level) ======================= */
const CheckAvailabilityInput = z.object({
  slug: z.string().optional(),
  email: z.string().email().optional(),
});

const CreateAccountInput = z.object({
  companyName: z.string().min(2),
  displayName: z.string().min(2),
  email: z.string().email(),
  website: z.string().url().optional(),
  password: z.string().min(8),
});

const UpsertProfileInput = z.object({
  industry: z.string().optional(),
  size: z.any().optional(), // jika mau ketat: z.nativeEnum(CompanySize).optional()
  foundedYear: z.number().int().optional(),
  about: z.string().optional(),
  logoUrl: z.string().url().optional(),
  bannerUrl: z.string().url().optional(),
  hqCity: z.string().optional(),
  hqCountry: z.string().optional(),
  linkedin: z.string().url().optional(),
  instagram: z.string().url().optional(),
  twitter: z.string().url().optional(),
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
    .array(z.object({ url: z.string().url(), type: z.string().optional() }))
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
 * Membuat Employer + EmployerAdminUser di dalam transaksi.
 * Mengembalikan { employerId, slug }.
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

  // ▼▼▼ PERBAIKAN 3: Hapus import duplikat. 'hashPassword' sudah di-import di atas (baris 11) ▼▼▼
  // const { hashPassword } = await import('../lib/hash');
  const passwordHash = await hashPassword(data.password);

  const result = await prisma.$transaction(async (tx) => {
    const employer = await tx.employer.create({
      data: {
        slug,
        legalName: data.companyName,
        displayName: data.displayName,
        website: data.website ?? null,
        status: 'draft', // atau EmployerStatus.draft
        onboardingStep: 'PACKAGE', // start ke step berikut (atau 'PROFILE' sesuai flow)
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
 * Menyimpan EmployerProfile lalu update onboardingStep -> PACKAGE (berikutnya pilih paket).
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
      data: { onboardingStep: 'PACKAGE' }, // OnboardingStep.PACKAGE
    })
    .catch(() => {});

  return { ok: true };
}

/**
 * choosePlan
 * Buat subscription aktif untuk employer & set onboardingStep -> JOB.
 * Mencegah duplikat subscription aktif untuk plan yang sama.
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
    // Jika sudah ada subscription aktif untuk plan yang sama, skip
    const exist = await tx.subscription.findFirst({
      where: { employerId: eid, planId: plan.id, status: 'active' },
      select: { id: true },
    });
    if (!exist) {
      await tx.subscription.create({
        data: {
          employerId: eid,
          planId: plan.id,
          status: 'active', // atau enum
        },
        select: { id: true },
      });
    }

    await tx.employer.update({
      where: { id: eid },
      data: { onboardingStep: 'JOB' }, // OnboardingStep.JOB
    });
  });

  return { ok: true };
}

/**
 * createDraftJob
 * Membuat satu draft job dan update onboardingStep -> VERIFY.
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
      data: { onboardingStep: 'VERIFY' }, // OnboardingStep.VERIFY
    });

    return j;
  });

  return { ok: true, jobId: job.id };
}

/**
 * submitVerification
 * Membuat VerificationRequest (+files) dan set onboardingStep -> DONE.
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
        data: body.files.map((f) => ({
          verificationId: req.id,
          fileUrl: f.url,
          fileType: f.type,
        })),
      });
    }

    await tx.employer.update({
      where: { id: body.employerId },
      data: { onboardingStep: 'DONE' }, // OnboardingStep.DONE
    });

    return req;
  });

  return { ok: true, verificationId: vr.id };
}