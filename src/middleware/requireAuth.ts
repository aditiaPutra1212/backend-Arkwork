// backend/src/middleware/requireAuth.ts
import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma'; // Import prisma

// Define correct cookie name (adjust if different in your auth.ts)
const USER_COOKIE_NAME = process.env.USER_COOKIE_NAME || 'ark_user_token';
const JWT_SECRET = process.env.JWT_SECRET;

// Extend Express Request type
export interface RequestWithUser extends Request {
  user?: {
    id: string; // Ensure 'id' property exists
    email?: string; // Add other user properties you might attach
    // role?: string; // Removed role from here
  };
}

export async function requireAuth(req: RequestWithUser, res: Response, next: NextFunction) {
  const token = req.cookies?.[USER_COOKIE_NAME];

  if (!token) {
    console.log(`[requireAuth] Failed: Cookie '${USER_COOKIE_NAME}' not found.`);
    return res.status(401).json({ ok: false, message: 'Not authenticated: Missing token.' });
  }

  if (!JWT_SECRET) {
    console.error('[requireAuth] Failed: JWT_SECRET environment variable is not set.');
    return res.status(500).json({ ok: false, message: 'Server configuration error.' });
  }

  try {
    const payload = jwt.verify(token, JWT_SECRET) as jwt.JwtPayload;
    const userId = payload.uid || payload.sub || payload.id; // Adjust based on your JWT payload

    if (!userId || typeof userId !== 'string') {
        console.log('[requireAuth] Failed: Invalid payload - missing user ID.', payload);
        throw new Error('Invalid token payload');
    }

    // Fetch user from DB, selecting only necessary fields WITHOUT role
    const user = await prisma.user.findUnique({
        where: { id: userId },
        // VVV--- REMOVE 'role: true' ---VVV
        select: { id: true, email: true } // Select only ID and email (or other existing fields)
        // VVV-------------------------VVV
    });

    if (!user) {
        console.log(`[requireAuth] Failed: User ${userId} not found in database.`);
        res.clearCookie(USER_COOKIE_NAME);
        return res.status(401).json({ ok: false, message: 'User not found.' });
    }

    // Attach user data to req.user WITHOUT role
    req.user = {
      id: user.id, // <-- Essential for reports.ts
      email: user.email,
      // role: user.role, // <-- REMOVE THIS LINE
    };
    console.log(`[requireAuth] Success: User ${req.user.id} authenticated.`);

    return next(); // Proceed

  } catch (err: any) {
    console.log('[requireAuth] Failed: Token verification error.', err.message);
    res.clearCookie(USER_COOKIE_NAME);
    if (err.name === 'TokenExpiredError') {
         return res.status(401).json({ ok: false, message: 'Session expired, please log in again.' });
    }
    return res.status(401).json({ ok: false, message: 'Invalid or expired token.' });
  }
}