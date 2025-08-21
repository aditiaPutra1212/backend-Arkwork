// src/routes/auth.ts
import { Router, Request, Response } from 'express'
import { prisma } from '../lib/prisma'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import { serialize, parse } from 'cookie'

const router = Router()

/** ================== ENV ================== **/
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me'
const COOKIE_SAMESITE = (process.env.COOKIE_SAMESITE || 'lax') as 'lax' | 'none' | 'strict'
const COOKIE_SECURE =
  process.env.COOKIE_SECURE === 'true' ||
  (process.env.NODE_ENV === 'production' && COOKIE_SAMESITE === 'none')

/** ================= JWT helpers ================= **/
type JWTPayload = {
  uid: string            // EmployerAdminUser.id
  role: 'admin'
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
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    })
  )
}

/** ============== Helpers ============== **/
async function resolveEmployer(opts: { employerSlug?: string | null; employerId?: string | null }) {
  const { employerSlug, employerId } = opts

  if (employerId) {
    const byId = await prisma.employer.findUnique({
      where: { id: employerId },
      select: { id: true, slug: true, displayName: true, legalName: true },
    })
    if (byId) return byId
  }

  if (employerSlug) {
    const bySlug = await prisma.employer.findUnique({
      where: { slug: employerSlug },
      select: { id: true, slug: true, displayName: true, legalName: true },
    })
    if (bySlug) return bySlug
  }

  const latest = await prisma.employer.findFirst({
    orderBy: { createdAt: 'desc' },
    select: { id: true, slug: true, displayName: true, legalName: true },
  })
  return latest || null
}

/** ================= Validators ================= **/
const signinSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  employerSlug: z.string().min(1).optional(),
})

const registerAdminSchema = z.object({
  employerId: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(8),
  fullName: z.string().min(2).max(100).optional(),
})

/** signup fleksibel: employerId/slug opsional */
const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(2).max(100).optional(),
  employerId: z.string().min(1).optional(),
  employerSlug: z.string().min(1).optional(),
})

const switchEmployerSchema = z.object({
  employerId: z.string().min(1).optional(),
  employerSlug: z.string().min(1).optional(),
})

/** ================= Routes ================= **/

// GET /auth
router.get('/', (_req, res) => {
  res.json({ message: 'Auth route works!' })
})

/** ---------------- SIGNUP (alias ke register-admin, tapi flexible) ---------------- */
// POST /auth/signup
router.post('/signup', async (req: Request, res: Response) => {
  try {
    const parsed = signupSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })

    const { email, password, name, employerId, employerSlug } = parsed.data

    const employer = await resolveEmployer({ employerId: employerId ?? null, employerSlug: employerSlug ?? null })
    if (!employer) return res.status(404).json({ message: 'Employer not found' })

    const exist = await prisma.employerAdminUser.findUnique({ where: { email } })
    if (exist) return res.status(409).json({ message: 'Email already used' })

    const passwordHash = await bcrypt.hash(password, 10)
    const admin = await prisma.employerAdminUser.create({
      data: {
        employerId: employer.id,
        email,
        passwordHash,
        fullName: name ?? null,
        isOwner: true,
        agreedTosAt: new Date(),
      },
      select: { id: true, email: true, employerId: true, fullName: true, isOwner: true },
    })

    const token = signToken({ uid: admin.id, role: 'admin', eid: employer.id })
    setAuthCookie(res, token)

    return res.status(201).json({
      ok: true,
      admin,
      employer: { id: employer.id, slug: employer.slug, displayName: employer.displayName, legalName: employer.legalName },
    })
  } catch (e) {
    console.error('SIGNUP ERROR:', e)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

/** ------------------ Endpoint lama: /auth/register-admin ------------------ */
// POST /auth/register-admin
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
      select: { id: true, email: true, employerId: true, fullName: true, isOwner: true },
    })

    const token = signToken({ uid: admin.id, role: 'admin', eid: employer.id })
    setAuthCookie(res, token)

    return res.status(201).json({ ok: true, admin })
  } catch (e) {
    console.error('REGISTER-ADMIN ERROR:', e)
    return res.status(500).json({ message: 'Internal server error' })
  }
})

/** ------------------------------- SIGNIN ------------------------------- */
// POST /auth/signin
router.post('/signin', async (req: Request, res: Response) => {
  try {
    const parsed = signinSchema.safeParse(req.body)
    if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })

    const { email, password, employerSlug } = parsed.data

    const admin = await prisma.employerAdminUser.findUnique({ where: { email } })
    if (!admin) return res.status(401).json({ message: 'Email atau password salah' })

    const ok = await bcrypt.compare(password, admin.passwordHash)
    if (!ok) return res.status(401).json({ message: 'Email atau password salah' })

    const employer =
      (await resolveEmployer({ employerSlug })) ??
      (await prisma.employer.findUnique({
        where: { id: admin.employerId },
        select: { id: true, slug: true, displayName: true, legalName: true },
      }))

    const token = signToken({ uid: admin.id, role: 'admin', eid: employer?.id ?? admin.employerId ?? null })
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

/** ------------------------------ SIGNOUT ------------------------------ */
// POST /auth/signout
router.post('/signout', (_req: Request, res: Response) => {
  res.setHeader(
    'Set-Cookie',
    serialize('token', '', {
      httpOnly: true,
      sameSite: COOKIE_SAMESITE,
      secure: COOKIE_SECURE,
      path: '/',
      maxAge: 0,
    })
  )
  return res.status(204).end()
})

/** -------------------------------- ME --------------------------------- */
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

    let employer: { id: string; slug: string; displayName: string | null; legalName: string | null } | null = null
    if (payload.eid) {
      employer = await prisma.employer.findUnique({
        where: { id: payload.eid },
        select: { id: true, slug: true, displayName: true, legalName: true },
      })
    }
    if (!employer) {
      employer = await resolveEmployer({})
    }

    return res.json({ ...admin, role: payload.role, employer })
  } catch (e) {
    console.error('ME ERROR:', e)
    return res.status(401).json({ message: 'Invalid token' })
  }
})

/** -------------------------- SWITCH EMPLOYER --------------------------- */
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

    const employer =
      (await resolveEmployer({ employerId: employerId ?? null, employerSlug: employerSlug ?? null })) ??
      (await prisma.employer.findUnique({
        where: { id: (await prisma.employerAdminUser.findUnique({ where: { id: payload.uid } }))?.employerId! },
        select: { id: true, slug: true, displayName: true, legalName: true },
      }))

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
