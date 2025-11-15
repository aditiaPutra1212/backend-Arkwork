"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withEmployerSession = withEmployerSession;
const cookie_1 = require("cookie");
const prisma_1 = require("../lib/prisma"); // atau default export sesuai project
const EMP_COOKIE = 'emp_session';
async function withEmployerSession(req, res, next) {
    try {
        const sid = (0, cookie_1.parse)(req.headers.cookie || '')[EMP_COOKIE];
        if (!sid)
            return res.status(401).json({ message: 'Unauthorized' });
        const s = await prisma_1.prisma.session.findUnique({
            where: { id: sid },
            select: { id: true, employerId: true, revokedAt: true, expiresAt: true },
        });
        const now = new Date();
        if (!s || s.revokedAt || (s.expiresAt && s.expiresAt < now) || !s.employerId) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.employerId = s.employerId;
        req.employerSessionId = s.id;
        next();
    }
    catch (e) {
        console.error('withEmployerSession error:', e);
        res.status(401).json({ message: 'Unauthorized' });
    }
}
