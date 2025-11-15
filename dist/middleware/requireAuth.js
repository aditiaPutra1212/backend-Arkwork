"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAuth = requireAuth;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const prisma_1 = require("../lib/prisma"); // Import prisma
// Define correct cookie name (adjust if different in your auth.ts)
const USER_COOKIE_NAME = process.env.USER_COOKIE_NAME || 'ark_user_token';
const JWT_SECRET = process.env.JWT_SECRET;
async function requireAuth(req, res, next) {
    var _a;
    const token = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[USER_COOKIE_NAME];
    if (!token) {
        console.log(`[requireAuth] Failed: Cookie '${USER_COOKIE_NAME}' not found.`);
        return res.status(401).json({ ok: false, message: 'Not authenticated: Missing token.' });
    }
    if (!JWT_SECRET) {
        console.error('[requireAuth] Failed: JWT_SECRET environment variable is not set.');
        return res.status(500).json({ ok: false, message: 'Server configuration error.' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        const userId = payload.uid || payload.sub || payload.id; // Adjust based on your JWT payload
        if (!userId || typeof userId !== 'string') {
            console.log('[requireAuth] Failed: Invalid payload - missing user ID.', payload);
            throw new Error('Invalid token payload');
        }
        // Fetch user from DB, selecting only necessary fields WITHOUT role
        const user = await prisma_1.prisma.user.findUnique({
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
    }
    catch (err) {
        console.log('[requireAuth] Failed: Token verification error.', err.message);
        res.clearCookie(USER_COOKIE_NAME);
        if (err.name === 'TokenExpiredError') {
            return res.status(401).json({ ok: false, message: 'Session expired, please log in again.' });
        }
        return res.status(401).json({ ok: false, message: 'Invalid or expired token.' });
    }
}
