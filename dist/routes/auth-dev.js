"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const authDev = (0, express_1.Router)();
// Admin session (DEV only)
authDev.get("/api/admin/me", (req, res) => {
    // TODO: ganti dengan pengecekan session beneran
    res.json({ ok: true, user: { id: "admin_dev", role: "admin", name: "Dev Admin" } });
});
// Employer session (DEV only)
authDev.get("/api/employers/auth/me", (req, res) => {
    res.json({ ok: true, user: { id: "emp_dev_1", role: "employer", name: "Dev Employer" } });
});
exports.default = authDev;
