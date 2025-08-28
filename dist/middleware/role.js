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
const cookie_1 = require("cookie");
const JWT_SECRET = process.env.JWT_SECRET || 'dev-secret-change-me';
const JWT_ADMIN_SECRET = process.env.JWT_ADMIN_SECRET || JWT_SECRET;
// use distinct cookies
exports.ADMIN_COOKIE = process.env.ADMIN_COOKIE_NAME || 'admin_token';
exports.EMP_COOKIE = process.env.EMP_COOKIE_NAME || 'emp_token';
exports.USER_COOKIE = process.env.USER_COOKIE_NAME || 'user_token';
/** generic cookie reader */
function readCookie(req, name) {
    const raw = req.headers.cookie || '';
    return (0, cookie_1.parse)(raw || '')[name];
}
/** ---- readers ---- */
function readUserAuth(req) {
    const token = readCookie(req, exports.USER_COOKIE);
    if (!token)
        throw new Error('no user token');
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
function readEmployerAuth(req) {
    const token = readCookie(req, exports.EMP_COOKIE);
    if (!token)
        throw new Error('no employer token');
    return jsonwebtoken_1.default.verify(token, JWT_SECRET);
}
function readAdminAuth(req) {
    const token = readCookie(req, exports.ADMIN_COOKIE);
    if (!token)
        throw new Error('no admin token');
    return jsonwebtoken_1.default.verify(token, JWT_ADMIN_SECRET);
}
/** ---- guards ---- */
function authRequired(req, res, next) {
    try {
        req.auth = readUserAuth(req);
        return next();
    }
    catch {
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
    catch {
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
    catch {
        return res.status(401).json({ message: 'Unauthorized' });
    }
}
