"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdmin = requireAdmin;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const IS_LOCAL = process.env.NODE_ENV !== 'production';
const ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET || '';
function requireAdmin(req, res, next) {
    var _a, _b, _c, _d;
    // DEV bypass if explicitly enabled (only for dev convenience)
    if (IS_LOCAL && process.env.DEV_ADMIN === '1')
        return next();
    const raw = (_b = (_a = req.cookies) === null || _a === void 0 ? void 0 : _a[ADMIN_COOKIE]) !== null && _b !== void 0 ? _b : (_d = (_c = req.headers['cookie']) === null || _c === void 0 ? void 0 : _c.split(';').map(s => s.trim()).find(s => s.startsWith(`${ADMIN_COOKIE}=`))) === null || _d === void 0 ? void 0 : _d.split('=')[1];
    if (!raw)
        return res.status(401).json({ message: 'Unauthorized' });
    if (!JWT_ADMIN_SECRET) {
        console.error('[AUTH] JWT_ADMIN_SECRET not set');
        return res.status(500).json({ message: 'Server misconfiguration' });
    }
    try {
        const payload = jsonwebtoken_1.default.verify(raw, JWT_ADMIN_SECRET);
        if (!payload || payload.role !== 'admin' || !payload.uid) {
            return res.status(401).json({ message: 'Unauthorized' });
        }
        req.user = { id: payload.uid, role: 'admin' };
        return next();
    }
    catch (err) {
        return res.status(401).json({ message: 'Invalid token' });
    }
}
