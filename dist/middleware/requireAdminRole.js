"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.requireAdminRole = requireAdminRole;
function requireAdminRole(req, res, next) {
    var _a;
    // Middleware ini harus dijalankan SETELAH requireAuthJwt
    if (((_a = req.admin) === null || _a === void 0 ? void 0 : _a.role) === 'admin') {
        next(); // User adalah admin, lanjutkan
    }
    else {
        res.status(403).json({ message: 'Forbidden: Admin access required' }); // User login tapi bukan admin
    }
}
