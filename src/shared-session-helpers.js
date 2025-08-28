"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.setHttpOnlyCookie = setHttpOnlyCookie;
exports.encodeSession = encodeSession;
exports.decodeSession = decodeSession;
const NODE_ENV = process.env.NODE_ENV || 'development';
const isProd = NODE_ENV === 'production';
/** Simpan cookie httpOnly, aman untuk session */
function setHttpOnlyCookie(res, name, value, maxAgeMs) {
    res.cookie(name, value, {
        httpOnly: true,
        sameSite: 'lax', // sesuaikan kalau butuh cross-site
        secure: isProd, // true di production (https)
        maxAge: maxAgeMs,
        path: '/',
    });
}
/** Encode session (JSON) -> base64url (string) */
function encodeSession(data) {
    return Buffer.from(JSON.stringify(data), 'utf8').toString('base64url');
}
/** Optional: decoder kalau butuh di tempat lain */
function decodeSession(raw) {
    if (!raw)
        return null;
    try {
        return JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    }
    catch {
        return null;
    }
}
