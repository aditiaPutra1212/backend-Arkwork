// src/routes/auth.ts
import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { serialize, parse } from 'cookie'

const router = Router()

const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'

/** ================= JWT ================= **/
type JWTPayload = {
  uid: string            // employerAdminUser.id
  role: 'admin'          // sesuai schema sekarang, hanya admin
  eid?: string | null    // employerId aktif (opsional)
}

function signToken(p: JWTPayload) {
  return jwt.sign(p, JWT_SECRET, { expiresIn: '7d' })
}
function verifyToken(t: string) {
  return jwt.verify(t, JWT_SECRET) as JWTPayload
}
function setAuthCookie(res: Response, token: string) {
  res.setHeader(
    'Set-Cookie',
    serialize('token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    })
  )
}

/** ============== Helpers ============== **/
async function resolveEmployerBySlugOrLatest(opts: { employerSlug?: string | null }) {
  const { employerSlug } = opts

  // slug → employer
  if (employerSlug) {
    const bySlug = await prisma.employer.findUnique({
      where: { slug: employerSlug },
      select: { id: true, slug: true, displayName: true, legalName: true },
    })
    if (bySlug) return bySlug
  }

  // fallback: employer terbaru
  const first = await prisma.employer.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, slug: true, displayName: true, legalName: true },
  })
  return first || null
}

/** ================= Validators ================= **/
const registerAdminSchema = z.object({
  employerId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100).optional(),
})

const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  employerSlug: z.string().min(1).optional(), // opsional: pilih employer saat login
})

const switchEmployerSchema = z.object({
  employerId: z.string().min(1).optional(),
  employerSlug: z.string().min(1).optional(),
})

/** ================= Routes ================= **/

// GET /auth
router.get('/', (_req, res) => {
  res.json({ message: 'Auth is alive' })
})

// POST /auth/register-admin  (buat akun EmployerAdminUser)
router.post('/register-admin', async (req: Request, res: Response) => {
  try {
    const parsed = registerAdminSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })

    const { employerId, email, password, fullName } = parsed.data

    const employer = await prisma.employer.findUnique({ where: { id: employerId } })
    if (!employer) return res.status(404).json({ error: 'Employer not found' })

    const exist = await prisma.employerAdminUser.findUnique({ where: { email } })
    if (exist) return res.status(409).json({ error: 'Email already used' })

    const passwordHash = await bcrypt.hash(password, 10)
    const admin = await prisma.employerAdminUser.create({
      data: {
        employerId,
        email,
        passwordHash,
        fullName: fullName ?? null,
        isOwner: true,
        agreedTosAt: new Date(),
      },
      select: { id: true, email: true, employerId: true, fullName: true },
    })

    const token = signToken({ uid: admin.id, role: 'admin', eid: admin.employerId })
    setAuthCookie(res, token)

    return res.status(201).json({ ok: true, admin })
  } catch (e) {
    console.error('REGISTER-ADMIN ERROR:', e)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

// POST /auth/signin (login EmployerAdminUser)
router.post('/signin', async (req: Request, res: Response) => {
  try {
    const parsed = signinSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })

    const { email, password, employerSlug } = parsed.data

    const admin = await prisma.employerAdminUser.findUnique({ where: { email } })
    if (!admin) return res.status(401).json({ message: 'Email atau password salah' })

    const ok = await bcrypt.compare(password, admin.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Email atau password salah' })

    // employer aktif: pakai slug bila ada, kalau tidak pakai employerId admin
    let employer =
      (await resolveEmployerBySlugOrLatest({ employerSlug })) ??
      (await prisma.employer.findUnique({
        where: { id: admin.employerId },
        select: { id: true, slug: true, displayName: true, legalName: true },
      }))

    const token = signToken({
      uid: admin.id,
      role: 'admin',
      eid: employer?.id ?? admin.employerId ?? null,
    })
    setAuthCookie(res, token)

    return res.json({
      ok: true,
      admin: {
        id: admin.id,
        email: admin.email,
        fullName: admin.fullName ?? null,
        employerId: admin.employerId,
        isOwner: !!admin.isOwner,
      },
      employer,
    })
  } catch (e) {
    console.error('SIGNIN ERROR:', e)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

// POST /auth/signout
router.post('/signout', (_req: Request, res: Response) => {
  res.setHeader(
    'Set-Cookie',
    serialize('token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
  )
  return res.status(204).end()
})

// GET /auth/me
router.get('/me', async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || ''
    const cookies = parse(raw)
    const token = cookies['token']
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const payload = verifyToken(token) // { uid, role, eid }
    const admin = await prisma.employerAdminUser.findUnique({
      where: { id: payload.uid },
      select: {
        id: true,
        email: true,
        fullName: true,
        employerId: true,
        isOwner: true,
        createdAt: true,
      },
    })
    if (!admin) return res.status(401).json({ message: 'Unauthorized' })

    let employer = null as null | { id: string; slug: string; displayName: string | null; legalName: string | null }

    if (payload.eid) {
      employer =
        (await prisma.employer.findUnique({
          where: { id: payload.eid },
          select: { id: true, slug: true, displayName: true, legalName: true },
        })) || null
    }
    if (!employer) {
      employer = await resolveEmployerBySlugOrLatest({})
    }

    return res.json({ ...admin, role: payload.role, employer })
  } catch (e) {
    console.error('ME ERROR:', e)
    return res.status(401).json({ message: 'Invalid token' })
  }
})

// POST /auth/switch-employer
router.post('/switch-employer', async (req: Request, res: Response) => {
  try {
    const raw = req.headers.cookie || ''
    const cookies = parse(raw)
    const token = cookies['token']
    if (!token) return res.status(401).json({ message: 'Unauthorized' })

    const payload = verifyToken(token)
    const parsed = switchEmployerSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })

    const { employerId, employerSlug } = parsed.data

    // karena admin selalu terikat ke satu employerId,
    // kita abaikan input lain dan gunakan employerId milik admin saat ini bila tidak ada slug/id valid
    let employer = null as { id: string; slug: string; displayName: string | null; legalName: string | null } | null

    if (employerId) {
      employer = await prisma.employer.findUnique({
        where: { id: employerId },
        select: { id: true, slug: true, displayName: true, legalName: true },
      })
    } else if (employerSlug) {
      employer = await prisma.employer.findUnique({
        where: { slug: employerSlug },
        select: { id: true, slug: true, displayName: true, legalName: true },
      })
    } else {
      employer =
        (await prisma.employer.findUnique({
          where: { id: (await prisma.employerAdminUser.findUnique({ where: { id: payload.uid } }))?.employerId! },
          select: { id: true, slug: true, displayName: true, legalName: true },
        })) || (await resolveEmployerBySlugOrLatest({}))
    }

    if (!employer) return res.status(404).json({ message: 'Employer tidak ditemukan' })

    const newToken = signToken({ uid: payload.uid, role: payload.role, eid: employer.id })
    setAuthCookie(res, newToken)

    return res.json({ ok: true, employer })
  } catch (e) {
    console.error('SWITCH EMPLOYER ERROR:', e)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

export default router
