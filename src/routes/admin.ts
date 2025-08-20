import { Router, Request, Response, NextFunction } from 'express'
import { z } from 'zod'
import bcrypt from 'bcryptjs'
import jwt from 'jsonwebtoken'
import * as cookie from 'cookie'
import { prisma } from '../lib/prisma' // gunakan prisma instance bersama

const router = Router()

/** ==== JWT util ==== */
const ADMIN_JWT_SECRET = process.env.JWT_ADMIN_SECRET || 'dev-admin-secret'
type AdminPayload = { aid: string; eid: string } // adminId + employerId

const sign = (p: AdminPayload) => jwt.sign(p, ADMIN_JWT_SECRET, { expiresIn: '7d' })
const verify = (t: string) => jwt.verify(t, ADMIN_JWT_SECRET) as AdminPayload

const setCookie = (res: Response, token: string) =>
  res.setHeader(
    'Set-Cookie',
    cookie.serialize('admin_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 60 * 60 * 24 * 7, // 7 hari
    })
  )

const clearCookie = (res: Response) =>
  res.setHeader(
    'Set-Cookie',
    cookie.serialize('admin_token', '', {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      path: '/',
      maxAge: 0,
    })
  )

/** ==== Middleware auth admin ==== */
function requireAdmin(req: Request, res: Response, next: NextFunction) {
  try {
    const cookies = cookie.parse(req.headers.cookie || '')
    const token = cookies['admin_token']
    if (!token) return res.status(401).json({ message: 'Unauthorized' })
    const payload = verify(token)
    ;(req as any).adminId = payload.aid
    ;(req as any).employerId = payload.eid
    next()
  } catch {
    return res.status(401).json({ message: 'Unauthorized' })
  }
}

/** ==== Schemas ==== */
const signinSchema = z.object({
  // schema kamu punya EmployerAdminUser { email, passwordHash, ... }
  email: z.string().email(),
  password: z.string().min(6),
})

/** ==== Routes ==== */

// test cepat
router.get('/ping', (_req, res) => res.json({ ok: true }))

// POST /api/admin/signin
router.post('/signin', async (req: Request, res: Response) => {
  const parsed = signinSchema.safeParse(req.body)
  if (!parsed.success) return res.status(400).json({ error: parsed.error.format() })

  const { email, password } = parsed.data

  const admin = await prisma.employerAdminUser.findUnique({
    where: { email: String(email) },
  })
  if (!admin) return res.status(401).json({ message: 'Email atau password salah' })

  const ok = await bcrypt.compare(String(password), admin.passwordHash)
  if (!ok) return res.status(401).json({ message: 'Email atau password salah' })

  // sign token: admin id + employer id
  const token = sign({ aid: admin.id, eid: admin.employerId })
  setCookie(res, token)

  return res.json({
    ok: true,
    admin: {
      id: admin.id,
      email: admin.email,
      fullName: admin.fullName ?? null,
      employerId: admin.employerId,
      isOwner: !!admin.isOwner,
      createdAt: admin.createdAt,
    },
  })
})

// POST /api/admin/signout
router.post('/signout', (_req, res) => {
  clearCookie(res)
  res.status(204).end()
})

// GET /api/admin/me
router.get('/me', requireAdmin, async (req: Request, res: Response) => {
  const admin = await prisma.employerAdminUser.findUnique({
    where: { id: (req as any).adminId as string },
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
  return res.json(admin)
})

// GET /api/admin/stats
router.get('/stats', requireAdmin, async (_req: Request, res: Response) => {
  const [employers, jobs, subscriptions, admins] = await Promise.all([
    prisma.employer.count(),
    prisma.job.count(),
    prisma.subscription.count(),
    prisma.employerAdminUser.count(),
  ])

  res.json({ employers, jobs, subscriptions, admins })
})

export default router
