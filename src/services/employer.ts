// src/services/employer.ts
import { prisma } from '../lib/prisma'
import { hashPassword } from '../lib/hash'
import { Prisma } from '@prisma/client'

export async function checkAvailability(params: { slug?: string; email?: string }) {
  const { slug, email } = params
  const checks: Record<string, boolean> = {}

  if (slug) {
    checks.slugTaken = !!(await prisma.employer.findUnique({
      where: { slug },
      select: { id: true },
    }))
  }

  if (email) {
    checks.emailTaken = !!(await prisma.employerAdminUser.findUnique({
      where: { email },
      select: { id: true },
    }))
  }

  return checks
}

export async function createAccount(input: {
  companyName: string
  displayName: string
  email: string
  website?: string
  password: string
}) {
  const base =
    input.displayName.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '') || 'company'
  let slug = base,
    i = 1

  while (
    await prisma.employer.findUnique({
      where: { slug },
      select: { id: true },
    })
  ) {
    slug = `${base}-${i++}`
  }

  const passwordHash = await hashPassword(input.password)

  const result = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const employer = await tx.employer.create({
      data: {
        slug,
        legalName: input.companyName,
        displayName: input.displayName,
        website: input.website,
        status: 'draft',
      },
      select: { id: true },
    })

    await tx.employerAdminUser.create({
      data: {
        employerId: employer.id,
        email: input.email,
        passwordHash,
        isOwner: true,
        agreedTosAt: new Date(),
      },
      select: { id: true },
    })

    return { employerId: employer.id }
  })

  return { employerId: result.employerId, slug }
}

export async function upsertProfile(employerId: string, profile: any) {
  await prisma.employerProfile.upsert({
    where: { employerId },
    update: profile,
    create: { employerId, ...profile },
  })

  // tidak ada kolom onboardingStep di schema → tidak update apa-apa
  return { ok: true }
}

export async function choosePlan(employerId: string, planSlug: string) {
  const plan = await prisma.plan.findUnique({
    where: { slug: planSlug },
    select: { id: true },
  })
  if (!plan) throw { status: 404, message: 'Plan not found' }

  await prisma.subscription.create({
    data: {
      employerId,
      planId: plan.id,
      status: 'active',
    },
    select: { id: true },
  })

  return { ok: true }
}

export async function createDraftJob(
  employerId: string,
  data: { title: string; description?: string; location?: string; employment?: string }
) {
  const job = await prisma.job.create({
    data: { employerId, ...data, isDraft: true, isActive: false },
    select: { id: true },
  })

  return { ok: true, jobId: job.id }
}

export async function submitVerification(
  employerId: string,
  note?: string,
  files?: { url: string; type?: string }[]
) {
  const vr = await prisma.$transaction(async (tx: Prisma.TransactionClient) => {
    const req = await tx.verificationRequest.create({
      data: { employerId, status: 'pending', note },
      select: { id: true },
    })

    if (files?.length) {
      await tx.verificationFile.createMany({
        data: files.map((f) => ({ verificationId: req.id, fileUrl: f.url, fileType: f.type })),
      })
    }

    return req
  })

  return { ok: true, verificationId: vr.id }
}
