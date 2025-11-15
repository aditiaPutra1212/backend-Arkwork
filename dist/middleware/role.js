"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.USER_COOKIE = exports.EMP_COOKIE = exports.ADMIN_COOKIE = void 0;
exports.readUserAuth = readUserAuth;
exports.readEmployerAuth = readEmployerAuth;
exports.readAdminAuth = readAdminAuth;
exports.authRequired = authRequired;
exports.employerRequired = employerRequired;
exports.adminRequired = adminRequired;
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
// default secrets (dev fallback)
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;
// cookie names (bisa override via env)
exports.ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
exports.EMP_COOKIE = process.env.EMP_COOKIE_NAME || 'emp_token';
exports.USER_COOKIE = process.env.USER_COOKIE_NAME || 'user_token';
/**
 * Helper: get token from cookie store (uses cookie-parser so req.cookies exists)
 */
function getCookieToken(req, name) {
    // cookie-parser populates req.cookies; fallback to raw header parse if needed
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const rc = req.cookies;
    if (rc && typeof rc === 'object') {
        return rc[name];
    }
    // fallback: try header parse (less preferred)
    const raw = req.headers.cookie || '';
    try {
        // lightweight parse: find "name="
        const m = raw.split(';').map(s => s.trim()).find(s => s.startsWith(name + '='));
        if (!m)
            return undefined;
        return decodeURIComponent(m.substring(name.length + 1));
    }
    catch {
        return undefined;
    }
}
/** Verify user token (throws on invalid) */
function readUserAuth(req) {
    var _a, _b, _c;
    const token = getCookieToken(req, exports.USER_COOKIE);
    if (!token)
        throw new Error('no user token');
    try {
        // you can add verify options (issuer/audience) here if you used them
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!payload || !payload.uid)
            throw new Error('invalid token payload');
        return { uid: String(payload.uid), role: (_a = payload.role) !== null && _a !== void 0 ? _a : 'user', eid: (_b = payload.eid) !== null && _b !== void 0 ? _b : null };
    }
    catch (err) {
        throw new Error(`invalid user token: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : err}`);
    }
}
/** Verify employer token (throws on invalid) */
function readEmployerAuth(req) {
    var _a, _b, _c;
    const token = getCookieToken(req, exports.EMP_COOKIE);
    if (!token)
        throw new Error('no employer token');
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_SECRET);
        if (!payload || !payload.uid)
            throw new Error('invalid token payload');
        return { uid: String(payload.uid), role: (_a = payload.role) !== null && _a !== void 0 ? _a : 'employer', eid: (_b = payload.eid) !== null && _b !== void 0 ? _b : null };
    }
    catch (err) {
        throw new Error(`invalid employer token: ${(_c = err === null || err === void 0 ? void 0 : err.message) !== null && _c !== void 0 ? _c : err}`);
    }
}
/** Verify admin token (throws on invalid) */
function readAdminAuth(req) {
    var _a;
    const token = getCookieToken(req, exports.ADMIN_COOKIE);
    if (!token)
        throw new Error('no admin token');
    try {
        const payload = jsonwebtoken_1.default.verify(token, JWT_ADMIN_SECRET);
        if (!payload || !payload.uid)
            throw new Error('invalid token payload');
        return { uid: String(payload.uid), role: 'admin' };
    }
    catch (err) {
        throw new Error(`invalid admin token: ${(_a = err === null || err === void 0 ? void 0 : err.message) !== null && _a !== void 0 ? _a : err}`);
    }
}
/* ===== guards (express middleware) ===== */
function authRequired(req, res, next) {
    try {
        req.auth = readUserAuth(req);
        return next();
    }
    catch (err) {
        // don't leak details to client, but log for debugging
        console.warn('[authRequired] auth failed:', err.message || err);
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
function employerRequired(req, res, next) {
    try {
        const p = readEmployerAuth(req);
        req.auth = p;
        if (p.role === 'employer' || p.role === 'admin')
            return next();
        return res.status(403).json({ message: 'Employer only' });
    }
    catch (err) {
        console.warn('[employerRequired] auth failed:', err.message || err);
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
function adminRequired(req, res, next) {
    try {
        const p = readAdminAuth(req);
        req.auth = p;
        if (p.role === 'admin')
            return next();
        return res.status(403).json({ message: 'Admin only' });
    }
    catch (err) {
        console.warn('[adminRequired] auth failed:', err.message || err);
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
