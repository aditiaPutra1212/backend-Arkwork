"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.withUserSession = withUserSession;
const prisma_1 = require("../lib/prisma");
async function withUserSession(req, res, next) {
    var _a;
    try {
        const sid = ((_a = req.cookies) === null || _a === void 0 ? void 0 : _a.sid) || req.header('X-Session-Id'); // sesuaikan
        if (!sid)
            return res.status(401).json({ ok: false, error: 'Unauthorized (no sid)' });
        const s = await prisma_1.prisma.session.findFirst({
            where: { id: sid, revokedAt: null, expiresAt: { gt: new Date() } },
            select: { userId: true },
        });
        if (!(s === null || s === void 0 ? void 0 : s.userId))
            return res.status(401).json({ ok: false, error: 'Unauthorized' });
        req.userId = s.userId;
        next();
    }
    catch (e) {
        res.status(500).json({ ok: false, error: (e === null || e === void 0 ? void 0 : e.message) || 'Session error' });
    }
}
